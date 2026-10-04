package server

import (
	"cmp"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/beremaran/efficient-daemon/internal/core"
)

// modelsRequest names the server to list: the AskRequest fields that pick a
// connection, with the same defaults and rules.
type modelsRequest struct {
	Provider string `json:"provider,omitempty" jsonschema:"description=openai or jevjam; empty keeps the server default."`
	BaseURL  string `json:"base-url,omitempty" jsonschema:"description=Absolute HTTP(S) API base URL; required if no server base URL is configured."`
	APIKey   string `json:"api-key,omitempty"`
}

// handleModels lists the models at the target server's /models endpoint
// (/v1/models for jevjam, whose base URL is the server root), so the
// workbench offers only models the server has. The browser cannot call that
// server itself: it would hit CORS and expose the key.
func (h *handler) handleModels(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var req modelsRequest
	if err := decoder.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid request body: %w", err))
		return
	}
	cfg, err := h.resolve(AskRequest{Provider: req.Provider, BaseURL: req.BaseURL, APIKey: req.APIKey})
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if cfg.baseURL == "" {
		writeError(w, http.StatusBadRequest, errors.New("base-url is required; set --base-url on the server or include it in the request"))
		return
	}
	if err := core.ValidateBaseURL(cfg.baseURL); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	apiBase, apiKey := cfg.baseURL, cfg.apiKey
	if cfg.provider == core.ProviderJevjam {
		apiBase = strings.TrimRight(apiBase, "/") + "/v1"
	} else {
		apiKey = cmp.Or(apiKey, os.Getenv("OPENAI_API_KEY"))
	}
	models, err := core.ListModels(r.Context(), apiBase, apiKey, cfg.timeout)
	if err != nil {
		writeError(w, upstreamStatus(err), fmt.Errorf("list models: %w", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string][]string{"models": models})
}
