package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func postModels(t *testing.T, h http.Handler, body string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("POST", "/models", strings.NewReader(body)))
	return rec
}

func TestModelsListsOpenAIServer(t *testing.T) {
	var path, auth string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path, auth = r.URL.Path, r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"b"},{"id":"a"},{"id":"b"}]}`))
	}))
	defer upstream.Close()
	h := newTestHandler(t, upstream.URL+"/v1")

	rec := postModels(t, h, `{}`)
	var got struct{ Models []string }
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || rec.Code != http.StatusOK || strings.Join(got.Models, ",") != "a,b" {
		t.Fatalf("status = %d, body = %s (%v)", rec.Code, rec.Body.String(), err)
	}
	if path != "/v1/models" || auth != "Bearer key" {
		t.Errorf("upstream got %s with Authorization %q", path, auth)
	}
}

func TestModelsListsJevjamServer(t *testing.T) {
	var path, auth string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path, auth = r.URL.Path, r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"data":[{"id":"english"},{"id":"clef-flash"}]}`))
	}))
	defer upstream.Close()
	t.Setenv("OPENAI_API_KEY", "openai-secret")
	// The server defaults belong to openai, so none of them reach jevjam.
	h := newTestHandler(t, "http://openai.example")

	rec := postModels(t, h, `{"provider":"jevjam","base-url":"`+upstream.URL+`/"}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `["clef-flash","english"]`) {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if path != "/v1/models" || auth != "" {
		t.Errorf("upstream got %s with Authorization %q", path, auth)
	}
}

func TestModelsErrors(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusNotFound)
	}))
	defer upstream.Close()
	h, err := New(Config{Version: "test"})
	if err != nil {
		t.Fatal(err)
	}
	tests := map[string]struct {
		body string
		want int
	}{
		"no base url":      {`{}`, http.StatusBadRequest},
		"bad base url":     {`{"base-url":"ftp://x"}`, http.StatusBadRequest},
		"unknown provider": {`{"provider":"other","base-url":"http://x"}`, http.StatusBadRequest},
		"unknown field":    {`{"model":"x"}`, http.StatusBadRequest},
		"upstream error":   {`{"base-url":"` + upstream.URL + `"}`, http.StatusBadGateway},
	}
	for name, tt := range tests {
		if rec := postModels(t, h, tt.body); rec.Code != tt.want {
			t.Errorf("%s: status = %d, body = %s", name, rec.Code, rec.Body.String())
		}
	}
}
