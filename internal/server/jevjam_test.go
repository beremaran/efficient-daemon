package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const jevjamSchema = `{"type":"object","properties":{"mood":{"type":"string","enum":["café","bar"]},"leave":{"type":"boolean"}},"required":["mood","leave"],"additionalProperties":false}`

func TestAskJevjamEndToEnd(t *testing.T) {
	var sent map[string]any
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &sent)
		_, _ = io.WriteString(w, `{"answers":{"mood":{"choice":"café","probabilities":{"café":0.7,"bar":0.3}},"leave":{"noul":0.2}}}`)
	}))
	defer upstream.Close()
	h := newTestHandler(t, upstream.URL)

	rec := postAsk(t, h, `{"provider":"jevjam","schema":`+jevjamSchema+`,"parts":[{"text":"hello"}]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || got["mood"] != "café" || got["leave"] != false {
		t.Fatalf("body = %s (%v)", rec.Body.String(), err)
	}
	header := rec.Header().Get("X-Jevjam-Answers")
	if strings.ContainsFunc(header, func(r rune) bool { return r > 0x7f }) {
		t.Errorf("header holds non-ASCII bytes: %s", header)
	}
	var answers map[string]map[string]any
	if err := json.Unmarshal([]byte(header), &answers); err != nil || answers["mood"]["choice"] != "café" {
		t.Errorf("X-Jevjam-Answers = %s (%v)", header, err)
	}
	if sent["state"] != "hello" || sent["model"] != "test" {
		t.Errorf("jevjam request = %v", sent)
	}
}

func TestAskJevjamRejectsBadRequests(t *testing.T) {
	h := newTestHandler(t, "http://upstream.example")
	tests := map[string]string{
		"temperature":      `{"provider":"jevjam","temperature":0.5,"schema":` + jevjamSchema + `,"parts":[{"text":"x"}]}`,
		"system":           `{"provider":"jevjam","system":"be nice","schema":` + jevjamSchema + `,"parts":[{"text":"x"}]}`,
		"reasoning-effort": `{"provider":"jevjam","reasoning-effort":"low","schema":` + jevjamSchema + `,"parts":[{"text":"x"}]}`,
		"free string":      `{"provider":"jevjam","schema":` + testSchema + `,"parts":[{"text":"x"}]}`,
		"unknown provider": `{"provider":"other","schema":` + testSchema + `,"parts":[{"text":"x"}]}`,
	}
	for name, body := range tests {
		if rec := postAsk(t, h, body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, body = %s", name, rec.Code, rec.Body.String())
		}
	}
}

func TestLintJevjam(t *testing.T) {
	h := newTestHandler(t, "http://upstream.example")
	lint := func(body string) lintResponse {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("POST", "/schema/lint", strings.NewReader(body)))
		var resp lintResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
		}
		return resp
	}
	if resp := lint(`{"provider":"jevjam","schema":` + testSchema + `}`); resp.Valid {
		t.Error("a free string property should not lint as valid for jevjam")
	}
	if resp := lint(`{"provider":"jevjam","schema":{"type":"object","properties":{"leave":{"type":"boolean"}}}}`); !resp.Valid || len(resp.Warnings) != 0 {
		t.Errorf("boolean schema: %+v", resp)
	}
	levels := `{"type":"object","properties":{"n":{"type":"integer","minimum":0,"maximum":19}}}`
	if resp := lint(`{"provider":"jevjam","schema":` + levels + `}`); resp.Valid {
		t.Error("20 levels should exceed the default cap")
	}
	if resp := lint(`{"provider":"jevjam","max-score-levels":20,"schema":` + levels + `}`); !resp.Valid {
		t.Errorf("20 levels should fit a cap of 20: %+v", resp)
	}
}

func TestConfigReportsProvider(t *testing.T) {
	h := newTestHandler(t, "http://upstream.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/config", nil))
	var got map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got["provider"] != "openai" || got["max-score-levels"] != float64(11) {
		t.Errorf("config = %v", got)
	}
}
