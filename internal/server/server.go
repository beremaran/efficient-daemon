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
	"strings"
	"time"

	"efficient-daemon/internal/core"
	"efficient-daemon/internal/message"
	"efficient-daemon/internal/output"
	responseschema "efficient-daemon/internal/schema"
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
	// Request defaults; every POST /ask field overrides these.
	BaseURL         string
	APIKey          string
	Model           string
	ReasoningEffort string
	Temperature     *float64
	MaxTokens       *int64
	Timeout         time.Duration
}

// AskRequest is the body of POST /ask: the ask command's flags as JSON, minus
// file paths (media travels inline) and the output-format flag. Field names
// match the CLI flags.
type AskRequest struct {
	Schema          json.RawMessage `json:"schema" jsonschema:"description=JSON Schema the model response must satisfy (strict structured-output subset)."`
	System          string          `json:"system,omitempty" jsonschema:"description=Optional system message."`
	Parts           []message.Part  `json:"parts" jsonschema:"description=The user message; at least one part, each with exactly one of text, image, or pdf."`
	Model           string          `json:"model,omitempty"`
	BaseURL         string          `json:"base-url,omitempty"`
	APIKey          string          `json:"api-key,omitempty"`
	ReasoningEffort string          `json:"reasoning-effort,omitempty" jsonschema:"description=none, minimal, low, medium, high, xhigh, or max."`
	Temperature     *float64        `json:"temperature,omitempty"`
	MaxTokens       *int64          `json:"max-tokens,omitempty"`
	Timeout         string          `json:"timeout,omitempty" jsonschema:"description=Per-attempt timeout as a Go duration (e.g. 30s); empty keeps the server default."`
}

// New builds the HTTP handler and generates the OpenAPI document.
func New(cfg Config) (http.Handler, error) {
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
	model, baseURL, apiKey, effort string
	temperature                    *float64
	maxTokens                      *int64
	timeout                        time.Duration
}

// resolve merges request fields over the server defaults and validates the
// result with the same rules the CLI applies to its flags.
func (h *handler) resolve(req AskRequest) (settings, error) {
	s := settings{
		model:       firstNonEmpty(req.Model, h.defaults.Model),
		baseURL:     firstNonEmpty(req.BaseURL, h.defaults.BaseURL),
		apiKey:      firstNonEmpty(req.APIKey, h.defaults.APIKey),
		effort:      firstNonEmpty(req.ReasoningEffort, h.defaults.ReasoningEffort),
		temperature: orDefault(req.Temperature, h.defaults.Temperature),
		maxTokens:   orDefault(req.MaxTokens, h.defaults.MaxTokens),
		timeout:     h.defaults.Timeout,
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
	for _, warning := range responseschema.StrictSubsetWarnings(req.Schema, "") {
		log.Printf("warning: %s", warning)
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

	client := core.NewClient(core.Config{BaseURL: cfg.baseURL, APIKey: cfg.apiKey, Timeout: cfg.timeout})
	botContext := core.NewMessagesContext(cfg.model, messages)
	raw, err := core.AskSchema(r.Context(), client, botContext, schemaMap, core.RequestOptions{
		ReasoningEffort: cfg.effort,
		Temperature:     cfg.temperature,
		MaxTokens:       cfg.maxTokens,
	})
	if err != nil {
		writeError(w, upstreamStatus(err), fmt.Errorf("ask model: %w", err))
		return
	}
	if err := responseschema.ValidateValue(sch, raw); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err)
		return
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
