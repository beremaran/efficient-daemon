// Workbench support endpoints: the server's request defaults (GET /config)
// and schema linting (POST /schema/lint). Both exist so the UI can show what
// will actually run without becoming a second implementation of the rules:
// linting reuses the same Parse/Compile/StrictSubsetWarnings code the ask
// flow uses.
package server

import (
	"encoding/json"
	"net/http"

	responseschema "efficient-daemon/internal/schema"
)

// configResponse carries the startup defaults the workbench renders as
// ghost text. api-key is deliberately absent: the server may hold a real key
// and the UI is reachable from any browser that can reach the server.
type configResponse struct {
	Version         string   `json:"version"`
	Model           string   `json:"model"`
	BaseURL         string   `json:"base-url"`
	ReasoningEffort string   `json:"reasoning-effort"`
	Temperature     *float64 `json:"temperature"`
	MaxTokens       *int64   `json:"max-tokens"`
	Timeout         string   `json:"timeout"`
}

func (h *handler) handleConfig(w http.ResponseWriter, _ *http.Request) {
	d := h.defaults
	writeJSON(w, http.StatusOK, configResponse{
		Version:         d.Version,
		Model:           d.Model,
		BaseURL:         d.BaseURL,
		ReasoningEffort: d.ReasoningEffort,
		Temperature:     d.Temperature,
		MaxTokens:       d.MaxTokens,
		Timeout:         d.Timeout.String(),
	})
}

// lintRequest mirrors the schema field of AskRequest.
type lintRequest struct {
	Schema json.RawMessage `json:"schema"`
}

// lintResponse is the outcome of checking one schema document. valid=false
// means the schema cannot compile; warnings are the advisory strict-subset
// findings (objects missing additionalProperties: false).
type lintResponse struct {
	Valid    bool     `json:"valid"`
	Errors   []string `json:"errors"`
	Warnings []string `json:"warnings"`
}

func (h *handler) handleLint(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var req lintRequest
	if err := decoder.Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body: " + err.Error()})
		return
	}
	if len(req.Schema) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "schema is required"})
		return
	}

	resp := lintResponse{Valid: true, Errors: []string{}, Warnings: []string{}}
	if _, err := responseschema.Parse(req.Schema); err != nil {
		resp.Valid = false
		resp.Errors = append(resp.Errors, err.Error())
		writeJSON(w, http.StatusOK, resp)
		return
	}
	if _, err := responseschema.Compile(req.Schema, ""); err != nil {
		resp.Valid = false
		resp.Errors = append(resp.Errors, err.Error())
		writeJSON(w, http.StatusOK, resp)
		return
	}
	resp.Warnings = append(resp.Warnings, responseschema.StrictSubsetWarnings(req.Schema, "")...)
	writeJSON(w, http.StatusOK, resp)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
