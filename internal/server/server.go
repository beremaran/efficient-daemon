// Package server serves the ask flow as a JSON API over HTTP. The OpenAPI
// document is generated at startup from the request types, so it cannot drift
// from the handlers.
package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/beremaran/efficient-daemon/internal/core"
	"github.com/beremaran/efficient-daemon/internal/jevjam"
	"github.com/beremaran/efficient-daemon/internal/message"
	"github.com/beremaran/efficient-daemon/internal/output"
	responseschema "github.com/beremaran/efficient-daemon/internal/schema"
)

// maxBodyBytes caps the whole request body before decoding, so an
// unauthenticated LAN client cannot make the server buffer unbounded data.
// It leaves headroom over the 20 MiB per-image guard for base64 overhead.
const maxBodyBytes = 30 << 20

// Config carries the listen address, request defaults, and version.
type Config struct {
	Host string
	Port int
	// Version is reported in the OpenAPI document.
	Version string
	// Workbench mounts the embedded UI at / (see internal/workbench).
	Workbench bool
	// Request defaults; every POST /ask field overrides these.
	Provider        string
	BaseURL         string
	APIKey          string
	Model           string
	ReasoningEffort string
	Temperature     *float64
	MaxTokens       *int64
	Timeout         time.Duration
	MaxScoreLevels  int
}

// AskRequest is the body of POST /ask: the ask command's flags as JSON, minus
// file paths (media travels inline) and the output-format flag. Field names
// match the CLI flags.
type AskRequest struct {
	Provider        string          `json:"provider,omitempty" jsonschema:"description=openai or jevjam; empty keeps the server default."`
	Schema          json.RawMessage `json:"schema" jsonschema:"description=JSON Schema the model response must satisfy (strict structured-output subset)."`
	System          string          `json:"system,omitempty" jsonschema:"description=Optional system message."`
	Parts           []message.Part  `json:"parts" jsonschema:"description=The user message; at least one part, each with exactly one of text, image, or pdf."`
	Model           string          `json:"model,omitempty" jsonschema:"description=Model identifier; required if no server model is configured."`
	BaseURL         string          `json:"base-url,omitempty" jsonschema:"description=Absolute HTTP(S) API base URL; required if no server base URL is configured."`
	APIKey          string          `json:"api-key,omitempty"`
	ReasoningEffort string          `json:"reasoning-effort,omitempty" jsonschema:"description=none, minimal, low, medium, high, xhigh, or max."`
	Temperature     *float64        `json:"temperature,omitempty"`
	MaxTokens       *int64          `json:"max-tokens,omitempty"`
	Timeout         string          `json:"timeout,omitempty" jsonschema:"description=Per-attempt timeout as a Go duration (e.g. 30s); empty keeps the server default."`
	MaxScoreLevels  *int            `json:"max-score-levels,omitempty" jsonschema:"description=jevjam only: most values a bounded integer property may span (2 to 64)."`
	Answers         bool            `json:"answers,omitempty" jsonschema:"description=jevjam only: wrap the body as {result, answers} to include jevjam's raw answers."`
}

// New builds the HTTP handler and generates the OpenAPI document.
func New(cfg Config) (http.Handler, error) {
	if strings.TrimSpace(cfg.BaseURL) != "" {
		if err := core.ValidateBaseURL(cfg.BaseURL); err != nil {
			return nil, fmt.Errorf("invalid server base URL: %w", err)
		}
	}
	h := &handler{defaults: cfg}
	if _, err := h.resolve(AskRequest{}); err != nil {
		return nil, fmt.Errorf("invalid server configuration: %w", err)
	}
	spec, err := buildSpec(cfg.Version)
	if err != nil {
		return nil, fmt.Errorf("build OpenAPI spec: %w", err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /ask", h.handleAsk)
	mux.HandleFunc("GET /openapi.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(spec)
	})
	mux.HandleFunc("GET /config", h.handleConfig)
	mux.HandleFunc("POST /schema/lint", h.handleLint)
	mux.HandleFunc("GET /docs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, docsHTML)
	})
	return mux, nil
}

type handler struct{ defaults Config }

// settings is the per-request configuration after merging the body over the
// startup defaults.
type settings struct {
	provider, model, baseURL, apiKey, effort string
	temperature                              *float64
	maxTokens                                *int64
	timeout                                  time.Duration
	maxScoreLevels                           int
}

// resolve merges request fields over the server defaults and validates the
// result with the same rules the CLI applies to its flags.
func (h *handler) resolve(req AskRequest) (settings, error) {
	d := h.defaults
	d.Provider = firstNonEmpty(d.Provider, core.ProviderOpenAI)
	provider := firstNonEmpty(strings.TrimSpace(req.Provider), d.Provider)
	if provider != d.Provider {
		// The server's connection defaults belong to its own provider; never
		// send its model or key to another one.
		d.Model, d.BaseURL, d.APIKey = "", "", ""
	}
	s := settings{
		provider:       provider,
		model:          firstNonEmpty(strings.TrimSpace(req.Model), strings.TrimSpace(d.Model)),
		baseURL:        firstNonEmpty(strings.TrimSpace(req.BaseURL), strings.TrimSpace(d.BaseURL)),
		apiKey:         strings.TrimSpace(firstNonEmpty(req.APIKey, d.APIKey)),
		effort:         strings.TrimSpace(firstNonEmpty(req.ReasoningEffort, d.ReasoningEffort)),
		temperature:    orDefault(req.Temperature, d.Temperature),
		maxTokens:      orDefault(req.MaxTokens, d.MaxTokens),
		timeout:        d.Timeout,
		maxScoreLevels: *orDefault(req.MaxScoreLevels, &d.MaxScoreLevels),
	}
	if s.maxScoreLevels == 0 && req.MaxScoreLevels == nil {
		s.maxScoreLevels = jevjam.DefaultMaxScoreLevels
	}
	if err := core.ValidateProvider(s.provider); err != nil {
		return s, err
	}
	if err := jevjam.ValidateMaxScoreLevels(s.maxScoreLevels); err != nil {
		return s, err
	}
	if s.provider == core.ProviderJevjam && (req.System != "" || req.ReasoningEffort != "" || req.Temperature != nil || req.MaxTokens != nil) {
		return s, errors.New("system, reasoning-effort, temperature, and max-tokens do not apply to the jevjam provider")
	}
	if s.provider != core.ProviderJevjam && req.Answers {
		return s, errors.New("answers applies only to the jevjam provider")
	}
	if req.Timeout != "" {
		parsed, err := time.ParseDuration(req.Timeout)
		if err != nil {
			return s, fmt.Errorf("timeout %q is not a duration like \"30s\": %w", req.Timeout, err)
		}
		s.timeout = parsed
	}
	if s.timeout < 0 {
		return s, errors.New("timeout must not be negative")
	}
	if s.temperature != nil && (*s.temperature < 0 || *s.temperature > 2) {
		return s, errors.New("temperature must be between 0 and 2")
	}
	if s.maxTokens != nil && *s.maxTokens <= 0 {
		return s, errors.New("max-tokens must be positive")
	}
	if err := core.ValidateReasoningEffort(s.effort); err != nil {
		return s, err
	}
	return s, nil
}

func (h *handler) handleAsk(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var req AskRequest
	if err := decoder.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid request body: %w", err))
		return
	}
	if decoder.More() {
		writeError(w, http.StatusBadRequest, errors.New("request body must contain a single JSON object"))
		return
	}
	cfg, err := h.resolve(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(cfg.baseURL) == "" {
		writeError(w, http.StatusBadRequest, errors.New("base-url is required; set --base-url on the server or include it in the request"))
		return
	}
	if err := core.ValidateBaseURL(cfg.baseURL); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(cfg.model) == "" && cfg.provider != core.ProviderJevjam {
		writeError(w, http.StatusBadRequest, errors.New("model is required; set --model on the server or include it in the request"))
		return
	}
	if len(req.Schema) == 0 {
		writeError(w, http.StatusBadRequest, errors.New("schema is required"))
		return
	}
	schemaMap, err := responseschema.Parse(req.Schema)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	sch, err := responseschema.Compile(req.Schema, "")
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var plan jevjam.Plan
	if cfg.provider == core.ProviderJevjam {
		if plan, err = jevjam.NewPlan(req.Schema, cfg.maxScoreLevels); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
	} else {
		for _, warning := range responseschema.StrictSubsetWarnings(req.Schema, "") {
			log.Printf("warning: %s", warning)
		}
	}

	dir, err := os.MkdirTemp("", "efficient-daemon-ask-*")
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Errorf("prepare upload directory: %w", err))
		return
	}
	defer os.RemoveAll(dir)
	if len(req.Parts) == 0 {
		writeError(w, http.StatusBadRequest, errors.New("parts must contain at least one item"))
		return
	}
	parts, err := materialize(req.Parts, dir)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	messages, err := message.FromParts(req.System, parts)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	var raw, answers json.RawMessage
	started := time.Now()
	if plan != nil {
		raw, answers, err = jevjam.Ask(r.Context(), jevjam.Config{BaseURL: cfg.baseURL, APIKey: cfg.apiKey, Model: cfg.model, Timeout: cfg.timeout}, plan, messages)
	} else {
		client, clientErr := core.NewClient(core.Config{BaseURL: cfg.baseURL, APIKey: cfg.apiKey, Timeout: cfg.timeout})
		if clientErr != nil {
			writeError(w, http.StatusBadRequest, clientErr)
			return
		}
		raw, err = core.AskSchema(r.Context(), client, core.NewMessagesContext(cfg.model, messages), schemaMap, core.RequestOptions{
			ReasoningEffort: cfg.effort,
			Temperature:     cfg.temperature,
			MaxTokens:       cfg.maxTokens,
		})
	}
	// Set before any WriteHeader path (success, 422, writeError) so every
	// response carries the model-call latency the workbench displays.
	w.Header().Set("X-Latency-Ms", strconv.FormatInt(time.Since(started).Milliseconds(), 10))
	if err != nil {
		writeError(w, upstreamStatus(err), fmt.Errorf("ask model: %w", err))
		return
	}
	if err := responseschema.ValidateValue(sch, raw); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	if req.Answers {
		raw, _ = json.Marshal(map[string]json.RawMessage{"result": raw, "answers": answers})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = output.Write(w, raw, "json-pretty")
}

// materialize replaces inline base64 media with temp files in dir so the
// message pipeline applies its existing guards (size caps, format sniffing,
// PDF rasterization) unchanged. http(s) URLs pass through as-is.
func materialize(parts []message.Part, dir string) ([]message.Part, error) {
	for i, part := range parts {
		if part.Image != "" {
			value, err := inlineValue("image", part.Image, dir, fmt.Sprintf("image-%d", i), true)
			if err != nil {
				return nil, err
			}
			parts[i].Image = value
		}
		if part.PDF != "" {
			value, err := inlineValue("pdf", part.PDF, dir, fmt.Sprintf("pdf-%d", i), false)
			if err != nil {
				return nil, err
			}
			parts[i].PDF = value
		}
	}
	return parts, nil
}

// inlineValue resolves one media field: URLs pass through (PDFs never, they
// cannot be fetched), data URLs are rejected, everything else must be
// standard base64 and is stored as a file the pipeline can guard against.
func inlineValue(kind, value, dir, name string, allowURL bool) (string, error) {
	if isHTTPURL(value) {
		if !allowURL {
			return "", fmt.Errorf("%s parts must be base64-encoded bytes; remote URLs are not fetched", kind)
		}
		return value, nil
	}
	if strings.HasPrefix(strings.ToLower(value), "data:") {
		return "", fmt.Errorf("%s parts must be base64-encoded bytes or an http(s) URL, not a data URL", kind)
	}
	raw, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return "", fmt.Errorf("%s part is neither an http(s) URL nor valid base64: %w", kind, err)
	}
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return "", fmt.Errorf("store %s upload: %w", kind, err)
	}
	return path, nil
}

func isHTTPURL(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && parsed.Host != "" && (parsed.Scheme == "http" || parsed.Scheme == "https")
}

// upstreamStatus maps a failed model request to 504 for timeouts and 502 for
// everything else the SDK reports.
func upstreamStatus(err error) int {
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, os.ErrDeadlineExceeded) {
		return http.StatusGatewayTimeout
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return http.StatusGatewayTimeout
	}
	return http.StatusBadGateway
}

func writeError(w http.ResponseWriter, status int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func orDefault[T any](value, fallback *T) *T {
	if value != nil {
		return value
	}
	return fallback
}
