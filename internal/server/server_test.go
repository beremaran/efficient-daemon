package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
)

const testSchema = `{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}`

// newUpstream returns a fake chat-completions endpoint answering with content,
// passing each request body to seen.
func newUpstream(t *testing.T, content string, seen func(body []byte)) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(buf)
		if seen != nil {
			seen(buf)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"id":"test","object":"chat.completion","created":0,"model":"test","choices":[{"index":0,"message":{"role":"assistant","content":%q},"finish_reason":"stop"}]}`, content)
	}))
}

func newTestHandler(t *testing.T, upstreamURL string) http.Handler {
	t.Helper()
	h, err := New(Config{
		Version: "test", BaseURL: upstreamURL, APIKey: "key", Model: "test",
		ReasoningEffort: "high", Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatalf("new server: %v", err)
	}
	return h
}

func postAsk(t *testing.T, h http.Handler, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/ask", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestAskEndToEnd(t *testing.T) {
	upstream := newUpstream(t, `{"answer":"yes"}`, func(body []byte) {
		text := string(body)
		if !strings.Contains(text, `"be nice"`) || !strings.Contains(text, `"hello"`) {
			t.Errorf("upstream messages missing system/user text: %s", text)
		}
		if !strings.Contains(text, `"test"`) {
			t.Errorf("model not forwarded: %s", text)
		}
	})
	defer upstream.Close()

	body := fmt.Sprintf(`{"schema":%s,"system":"be nice","parts":[{"text":"hello"}]}`, testSchema)
	rec := postAsk(t, newTestHandler(t, upstream.URL), body)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if got, want := rec.Body.String(), "{\n  \"answer\": \"yes\"\n}\n"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestAskBase64ImageBecomesDataURL(t *testing.T) {
	png := append([]byte("\x89PNG\r\n\x1a\n"), []byte("rest-of-file")...)
	var upstreamBody []byte
	upstream := newUpstream(t, `{"answer":"seen"}`, func(body []byte) { upstreamBody = body })
	defer upstream.Close()

	encoded := base64.StdEncoding.EncodeToString(png)
	body := fmt.Sprintf(`{"schema":%s,"parts":[{"image":%q}]}`, testSchema, encoded)
	rec := postAsk(t, newTestHandler(t, upstream.URL), body)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(string(upstreamBody), "data:image/png;base64,") {
		t.Errorf("upstream never saw the image as a data URL: %s", upstreamBody)
	}
}

func TestAskImageURLPassesThrough(t *testing.T) {
	var upstreamBody []byte
	upstream := newUpstream(t, `{"answer":"seen"}`, func(body []byte) { upstreamBody = body })
	defer upstream.Close()

	body := fmt.Sprintf(`{"schema":%s,"parts":[{"image":"https://example.com/pic.png"}]}`, testSchema)
	rec := postAsk(t, newTestHandler(t, upstream.URL), body)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(string(upstreamBody), "https://example.com/pic.png") {
		t.Errorf("image URL not forwarded: %s", upstreamBody)
	}
}

func TestAskRejectsInvalidRequests(t *testing.T) {
	upstream := newUpstream(t, `{"answer":"yes"}`, nil)
	defer upstream.Close()
	h := newTestHandler(t, upstream.URL)

	bodies := map[string]string{
		"not json":               `{`,
		"unknown field":          `{"schema":{},"parts":[{"text":"x"}],"files":[]}`,
		"trailing data":          `{"schema":{},"parts":[{"text":"x"}]} {}`,
		"missing schema":         `{"parts":[{"text":"x"}]}`,
		"schema not object":      `{"schema":"nope","parts":[{"text":"x"}]}`,
		"empty parts":            `{"schema":{},"parts":[]}`,
		"empty part":             `{"schema":{},"parts":[{}]}`,
		"two fields in part":     `{"schema":{},"parts":[{"text":"a","image":"b"}]}`,
		"temperature range":      `{"schema":{},"parts":[{"text":"x"}],"temperature":2.5}`,
		"max-tokens zero":        `{"schema":{},"parts":[{"text":"x"}],"max-tokens":0}`,
		"timeout not a duration": `{"schema":{},"parts":[{"text":"x"}],"timeout":"banana"}`,
		"bad effort":             `{"schema":{},"parts":[{"text":"x"}],"reasoning-effort":"ultra"}`,
		"image not base64":       `{"schema":{},"parts":[{"image":"!!!not base64!!!"}]}`,
		"data url image":         `{"schema":{},"parts":[{"image":"data:image/png;base64,AAAA"}]}`,
		"remote pdf":             `{"schema":{},"parts":[{"pdf":"https://example.com/doc.pdf"}]}`,
	}
	for name, body := range bodies {
		t.Run(name, func(t *testing.T) {
			rec := postAsk(t, h, body)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400, body = %s", rec.Code, rec.Body.String())
			}
			if !strings.Contains(rec.Body.String(), `"error"`) {
				t.Fatalf("error not reported: %s", rec.Body.String())
			}
		})
	}
}

func TestAskSchemaMismatchIs422(t *testing.T) {
	upstream := newUpstream(t, `{"answer":42}`, nil)
	defer upstream.Close()

	rec := postAsk(t, newTestHandler(t, upstream.URL), fmt.Sprintf(`{"schema":%s,"parts":[{"text":"x"}]}`, testSchema))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422, body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "does not match schema") {
		t.Fatalf("unexpected body: %s", rec.Body.String())
	}
}

func TestAskUpstreamErrorIs502(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusBadRequest)
	}))
	defer upstream.Close()

	rec := postAsk(t, newTestHandler(t, upstream.URL), fmt.Sprintf(`{"schema":%s,"parts":[{"text":"x"}]}`, testSchema))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502, body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "ask model") {
		t.Fatalf("unexpected body: %s", rec.Body.String())
	}
}

func TestAskTimeoutIs504(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(5 * time.Second):
		case <-r.Context().Done():
		}
	}))
	defer upstream.Close()

	body := fmt.Sprintf(`{"schema":%s,"parts":[{"text":"x"}],"timeout":"50ms"}`, testSchema)
	start := time.Now()
	rec := postAsk(t, newTestHandler(t, upstream.URL), body)
	if rec.Code != http.StatusGatewayTimeout {
		t.Fatalf("status = %d, want 504, body = %s", rec.Code, rec.Body.String())
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("request took %v, want failure near the 50ms timeout", elapsed)
	}
}

func TestAskBodyTooLargeIs400(t *testing.T) {
	upstream := newUpstream(t, `{"answer":"yes"}`, nil)
	defer upstream.Close()

	body := fmt.Sprintf(`{"schema":%s,"parts":[{"text":"x"}],"system":%q}`, testSchema, strings.Repeat("a", maxBodyBytes+1024))
	rec := postAsk(t, newTestHandler(t, upstream.URL), body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400, body = %s", rec.Code, rec.Body.String())
	}
}

func TestOpenAPISpecIsValid(t *testing.T) {
	upstream := httptest.NewServer(http.NotFoundHandler())
	defer upstream.Close()
	h := newTestHandler(t, upstream.URL)

	req := httptest.NewRequest("GET", "/openapi.json", nil)
	specRec := httptest.NewRecorder()
	h.ServeHTTP(specRec, req)
	if specRec.Code != http.StatusOK {
		t.Fatalf("status = %d", specRec.Code)
	}

	doc, err := new(openapi3.Loader).LoadFromData(specRec.Body.Bytes())
	if err != nil {
		t.Fatalf("spec is not valid OpenAPI JSON: %v\n%s", err, specRec.Body.String())
	}
	if err := doc.Validate(context.Background()); err != nil {
		t.Fatalf("spec does not validate: %v\n%s", err, specRec.Body.String())
	}
	if doc.OpenAPI != "3.0.3" {
		t.Fatalf("openapi = %q, want 3.0.3", doc.OpenAPI)
	}
	pathItem := doc.Paths.Find("/ask")
	if pathItem == nil || pathItem.Post == nil {
		t.Fatal("spec has no POST /ask")
	}
	requestSchema := doc.Components.Schemas["AskRequest"]
	if requestSchema == nil {
		t.Fatal("spec has no AskRequest component")
	}
	var raw struct {
		Properties map[string]json.RawMessage `json:"properties"`
		Required   []string                   `json:"required"`
	}
	marshaled, err := json.Marshal(requestSchema)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(marshaled, &raw); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"schema", "system", "parts", "model", "base-url", "api-key", "reasoning-effort", "temperature", "max-tokens", "timeout"} {
		if _, ok := raw.Properties[field]; !ok {
			t.Errorf("AskRequest schema missing property %q", field)
		}
	}
	for _, field := range []string{"schema", "parts"} {
		found := false
		for _, required := range raw.Required {
			if required == field {
				found = true
			}
		}
		if !found {
			t.Errorf("AskRequest schema does not require %q", field)
		}
	}
}

func TestDocsServesScalar(t *testing.T) {
	upstream := httptest.NewServer(http.NotFoundHandler())
	defer upstream.Close()
	h := newTestHandler(t, upstream.URL)

	req := httptest.NewRequest("GET", "/docs", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "@scalar/api-reference") {
		t.Fatalf("docs page does not load Scalar: %s", rec.Body.String())
	}

	req = httptest.NewRequest("GET", "/ask", nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET-only endpoint: status = %d, want 405", rec.Code)
	}
}

func TestNewRejectsInvalidConfig(t *testing.T) {
	tooHigh := 2.5
	tooLow := int64(-1)
	tests := []struct {
		name string
		cfg  Config
	}{
		{"temperature", Config{Temperature: &tooHigh}},
		{"max-tokens", Config{MaxTokens: &tooLow}},
		{"timeout", Config{Timeout: -time.Second}},
		{"reasoning-effort", Config{ReasoningEffort: "ultra"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := New(test.cfg); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}
