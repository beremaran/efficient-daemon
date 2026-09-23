package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestConfigEndpoint(t *testing.T) {
	h := newTestHandler(t, "http://upstream.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/config", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got["model"] != "test" || got["base-url"] != "http://upstream.example" {
		t.Errorf("defaults not reflected: %v", got)
	}
	if got["timeout"] != "5s" {
		t.Errorf("timeout = %v", got["timeout"])
	}
	if _, present := got["api-key"]; present {
		t.Error("api-key must not be exposed by /config")
	}
}

func TestLintEndpoint(t *testing.T) {
	tests := []struct {
		name        string
		schema      string
		wantValid   bool
		wantWarning bool
		wantError   bool
	}{
		{
			name:      "strict subset passes clean",
			schema:    testSchema,
			wantValid: true,
		},
		{
			name:        "object without additionalProperties warns",
			schema:      `{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"]}`,
			wantValid:   true,
			wantWarning: true,
		},
		{
			name:      "schema that does not compile fails",
			schema:    `{"type":"nonsense"}`,
			wantValid: false,
			wantError: true,
		},
		{
			name:      "schema not an object fails",
			schema:    `"just a string"`,
			wantValid: false,
			wantError: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newTestHandler(t, "http://upstream.example")
			body := `{"schema":` + tt.schema + `}`
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest("POST", "/schema/lint", strings.NewReader(body)))
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
			}
			var got lintResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if got.Valid != tt.wantValid {
				t.Errorf("valid = %v, want %v (errors: %v)", got.Valid, tt.wantValid, got.Errors)
			}
			if tt.wantWarning && len(got.Warnings) == 0 {
				t.Error("expected warnings, got none")
			}
			if !tt.wantWarning && len(got.Warnings) != 0 {
				t.Errorf("unexpected warnings: %v", got.Warnings)
			}
			if tt.wantError && len(got.Errors) == 0 {
				t.Error("expected errors, got none")
			}
		})
	}
}

func TestLintRejectsInvalidEnvelope(t *testing.T) {
	h := newTestHandler(t, "http://upstream.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("POST", "/schema/lint", strings.NewReader(`{"schema":`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestLintRejectsUnknownFields(t *testing.T) {
	h := newTestHandler(t, "http://upstream.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("POST", "/schema/lint", strings.NewReader(`{"schema":{},"extra":1}`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestAskLatencyHeader(t *testing.T) {
	upstream := newUpstream(t, `{"answer":"yes"}`, nil)
	defer upstream.Close()
	rec := postAsk(t, newTestHandler(t, upstream.URL),
		`{"schema":`+testSchema+`,"parts":[{"text":"hello"}]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	value := rec.Header().Get("X-Latency-Ms")
	if value == "" {
		t.Fatal("X-Latency-Ms header missing")
	}
	ms, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		t.Fatalf("X-Latency-Ms = %q: %v", value, err)
	}
	if ms < 0 || ms > int64(time.Minute/time.Millisecond) {
		t.Fatalf("X-Latency-Ms = %d looks wrong", ms)
	}
}

func TestLatencyHeaderOnValidationError(t *testing.T) {
	upstream := newUpstream(t, `{"wrong":"shape"}`, nil)
	defer upstream.Close()
	rec := postAsk(t, newTestHandler(t, upstream.URL),
		`{"schema":`+testSchema+`,"parts":[{"text":"hello"}]}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d", rec.Code)
	}
	if rec.Header().Get("X-Latency-Ms") == "" {
		t.Error("X-Latency-Ms should also be present on 422 responses")
	}
}
