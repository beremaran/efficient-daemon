package jevjam

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/openai/openai-go/v3"
)

const schema = `{
  "type": "object",
  "properties": {
    "team": {"type": "string", "description": "Who handles it?", "oneOf": [{"const": "billing", "description": "payments"}, {"const": "other"}]},
    "tone": {"type": "string", "enum": ["calm", "angry"]},
    "urgency": {"type": "integer", "minimum": 1, "maximum": 3},
    "size": {"type": "integer", "oneOf": [{"const": 10, "description": "large"}, {"const": 1, "description": "small"}, {"const": 5}]},
    "churn": {"type": "boolean", "description": "Will they leave?"}
  }
}`

func TestNewPlanTranslatesProperties(t *testing.T) {
	plan, err := NewPlan([]byte(schema), DefaultMaxScoreLevels)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]Question{
		"team":    {Type: "choice", Instructions: "Who handles it?", Criteria: map[string]string{"billing": "payments", "other": "other"}},
		"tone":    {Type: "choice", Instructions: "tone", Criteria: []string{"calm", "angry"}},
		"urgency": {Type: "score", Instructions: "urgency", Criteria: []string{"1", "2", "3"}},
		"churn":   {Type: "noul", Instructions: "Will they leave?"},
		"size":    {Type: "score", Instructions: "size", Criteria: []string{"small", "5", "large"}},
	}
	for name, q := range want {
		if got := plan[name].question; !reflect.DeepEqual(got, q) {
			t.Errorf("%s = %+v, want %+v", name, got, q)
		}
	}
}

func TestNewPlanRejectsUnsupportedSchemas(t *testing.T) {
	tests := map[string]string{
		"not an object":   `{"type": "string"}`,
		"no properties":   `{"type": "object", "properties": {}}`,
		"free string":     `{"type": "object", "properties": {"a": {"type": "string"}}}`,
		"unbounded int":   `{"type": "object", "properties": {"a": {"type": "integer", "minimum": 0}}}`,
		"too many levels": `{"type": "object", "properties": {"a": {"type": "integer", "minimum": 0, "maximum": 11}}}`,
		"one level":       `{"type": "object", "properties": {"a": {"type": "integer", "minimum": 2, "maximum": 2}}}`,
		"number enum":     `{"type": "object", "properties": {"a": {"type": "string", "enum": [1, 2]}}}`,
		"oneOf no const":  `{"type": "object", "properties": {"a": {"type": "string", "oneOf": [{"description": "x"}, {"const": "y"}]}}}`,
		"nested object":   `{"type": "object", "properties": {"a": {"type": "object"}}}`,
		"float const":     `{"type": "object", "properties": {"a": {"type": "integer", "oneOf": [{"const": 1.5}, {"const": 2}]}}}`,
		"one int const":   `{"type": "object", "properties": {"a": {"type": "integer", "oneOf": [{"const": 1}]}}}`,
		"dup int const":   `{"type": "object", "properties": {"a": {"type": "integer", "oneOf": [{"const": 1}, {"const": 2}, {"const": 1}]}}}`,
		"dup str const":   `{"type": "object", "properties": {"a": {"type": "string", "oneOf": [{"const": "a"}, {"const": "b"}, {"const": "a"}]}}}`,
		"float enum":      `{"type": "object", "properties": {"a": {"type": "integer", "enum": [1, 2.5]}}}`,
	}
	for name, raw := range tests {
		if _, err := NewPlan([]byte(raw), DefaultMaxScoreLevels); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestNewPlanIntegerEnum(t *testing.T) {
	plan, err := NewPlan([]byte(`{"type": "object", "properties": {"a": {"type": "integer", "enum": [3, 1, 2]}}}`), DefaultMaxScoreLevels)
	if err != nil {
		t.Fatal(err)
	}
	if got := plan["a"].question.Criteria; !reflect.DeepEqual(got, []string{"1", "2", "3"}) {
		t.Errorf("criteria = %v", got)
	}
}

func TestNewPlanAcceptsIntegralNumbers(t *testing.T) {
	plan, err := NewPlan([]byte(`{"type": "object", "properties": {"a": {"type": "integer", "minimum": 1.0, "maximum": 3e0}, "b": {"type": "integer", "enum": [1.0, 2e0]}}}`), DefaultMaxScoreLevels)
	if err != nil {
		t.Fatal(err)
	}
	if got := plan["a"].levels; !reflect.DeepEqual(got, []int64{1, 2, 3}) {
		t.Errorf("levels = %v", got)
	}
	if _, err := NewPlan([]byte(`{"type": "object", "properties": {"a": {"type": "integer", "minimum": 1.5, "maximum": 3}}}`), DefaultMaxScoreLevels); err == nil {
		t.Error("1.5 should not pass as a whole number")
	}
}

func TestNewPlanBoundsMaxLevels(t *testing.T) {
	raw := []byte(`{"type": "object", "properties": {"a": {"type": "integer", "minimum": 0, "maximum": 9999999}}}`)
	for _, n := range []int{-5, 1, MaxScoreLevelsLimit + 1, 1 << 30} {
		if _, err := NewPlan(raw, n); err == nil {
			t.Errorf("max levels %d: expected an error", n)
		}
	}
}

func TestValuesRejectsMissingAnswers(t *testing.T) {
	plan, err := NewPlan([]byte(schema), DefaultMaxScoreLevels)
	if err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{
		`{"churn": {}, "team": {"choice": "billing"}, "tone": {"choice": "calm"}, "urgency": {"score": 0}, "size": {"probabilities": {"0": 1, "1": 0, "2": 0}}}`,
		`{"churn": {"noul": 0}, "team": {"choice": "billing"}, "tone": {"choice": "calm"}, "urgency": null, "size": {"probabilities": {"0": 1, "1": 0, "2": 0}}}`,
		`{"churn": {"noul": 0}, "team": {"choice": "billing"}, "tone": {"choice": "calm"}, "urgency": {"score": 0}, "size": {"score": 0}}`,
		`{"churn": {"noul": 0}, "team": {"choice": "billing"}, "tone": {"choice": "calm"}, "urgency": {"score": 0}, "size": {"probabilities": {"wrong": 0.1, "keys": 0.8, "2": 0.1}}}`,
		`{"churn": {"noul": 0}, "team": {"choice": "billing"}, "tone": {"choice": "calm"}, "urgency": {"score": 0}, "size": {"probabilities": {"0": null, "1": null, "2": null}}}`,
	} {
		var answers map[string]answer
		if err := json.Unmarshal([]byte(raw), &answers); err != nil {
			t.Fatal(err)
		}
		if _, err := plan.values(answers); err == nil {
			t.Errorf("%s: expected an error", raw)
		}
	}
	// Real zeros still count as answers.
	var answers map[string]answer
	_ = json.Unmarshal([]byte(`{"churn": {"noul": 0}, "team": {"choice": "billing"}, "tone": {"choice": "calm"}, "urgency": {"score": 0}, "size": {"probabilities": {"0": 1, "1": 0, "2": 0}}}`), &answers)
	if result, err := plan.values(answers); err != nil || string(result) != `{"churn":false,"size":1,"team":"billing","tone":"calm","urgency":1}` {
		t.Errorf("result = %s, err = %v", result, err)
	}
}

func TestNewPlanHonorsMaxLevels(t *testing.T) {
	raw := []byte(`{"type": "object", "properties": {"a": {"type": "integer", "minimum": 0, "maximum": 20}}}`)
	if _, err := NewPlan(raw, 21); err != nil {
		t.Fatalf("21 levels should fit a cap of 21: %v", err)
	}
	if _, err := NewPlan(raw, 20); err == nil {
		t.Fatal("21 levels should exceed a cap of 20")
	}
}

func TestAskMapsAnswersBack(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "openai-secret")
	t.Setenv("JEVJAM_API_KEY", "")
	var sent struct {
		State     string              `json:"state"`
		Model     string              `json:"model"`
		Images    []string            `json:"images"`
		Questions map[string]Question `json:"questions"`
	}
	var auth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/systemone" {
			t.Errorf("path = %s", r.URL.Path)
		}
		auth = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &sent)
		_, _ = io.WriteString(w, `{"answers": {
			"team": {"type": "choice", "choice": "billing", "probabilities": {"billing": 0.9, "other": 0.1}},
			"tone": {"type": "choice", "choice": "angry"},
			"urgency": {"type": "score", "score": 1.6},
			"churn": {"type": "noul", "noul": 0.82},
			"size": {"type": "score", "score": 1.0, "probabilities": {"0": 0.5, "1": 0.0, "2": 0.5}}
		}}`)
	}))
	defer server.Close()

	plan, err := NewPlan([]byte(schema), DefaultMaxScoreLevels)
	if err != nil {
		t.Fatal(err)
	}
	image := openai.ChatCompletionContentPartImageParam{ImageURL: openai.ChatCompletionContentPartImageImageURLParam{URL: "data:image/png;base64,AA=="}}
	messages := []openai.ChatCompletionMessageParamUnion{openai.UserMessage([]openai.ChatCompletionContentPartUnionParam{
		{OfText: &openai.ChatCompletionContentPartTextParam{Text: "first"}},
		{OfImageURL: &image},
		{OfText: &openai.ChatCompletionContentPartTextParam{Text: "second"}},
	})}
	result, answers, err := Ask(context.Background(), Config{BaseURL: server.URL + "/", Model: "clef-flash"}, plan, messages)
	if err != nil {
		t.Fatal(err)
	}
	// size splits its vote between its ends; the mean would pick 5, which
	// got no votes, so the first top level wins instead.
	if string(result) != `{"churn":true,"size":1,"team":"billing","tone":"angry","urgency":3}` {
		t.Errorf("result = %s", result)
	}
	if !strings.Contains(string(answers), `"probabilities"`) {
		t.Errorf("raw answers lost probabilities: %s", answers)
	}
	if sent.State != "first\n\nsecond" || sent.Model != "clef-flash" || len(sent.Images) != 1 || len(sent.Questions) != 5 {
		t.Errorf("unexpected request: %+v", sent)
	}
	if auth != "" {
		t.Errorf("OPENAI_API_KEY leaked to jevjam: %q", auth)
	}
}

func TestAskSendsOnlyConfiguredKey(t *testing.T) {
	// The env key is the CLI's concern; Ask must not leak it to any host.
	t.Setenv("JEVJAM_API_KEY", "env-secret")
	var auth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		_, _ = io.WriteString(w, `{"answers": {"churn": {"noul": 0.1}}}`)
	}))
	defer server.Close()
	plan, _ := NewPlan([]byte(`{"type": "object", "properties": {"churn": {"type": "boolean"}}}`), DefaultMaxScoreLevels)
	messages := []openai.ChatCompletionMessageParamUnion{openai.UserMessage("hi")}
	if _, _, err := Ask(context.Background(), Config{BaseURL: server.URL}, plan, messages); err != nil || auth != "" {
		t.Errorf("Authorization = %q, err = %v", auth, err)
	}
	if _, _, err := Ask(context.Background(), Config{BaseURL: server.URL, APIKey: "jevjam-secret"}, plan, messages); err != nil || auth != "Bearer jevjam-secret" {
		t.Errorf("Authorization = %q, err = %v", auth, err)
	}
}

func TestAskReportsJevjamErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"detail": "images and videos need clef-flash; set model to clef-flash"}`)
	}))
	defer server.Close()
	plan, _ := NewPlan([]byte(`{"type": "object", "properties": {"churn": {"type": "boolean"}}}`), DefaultMaxScoreLevels)
	_, _, err := Ask(context.Background(), Config{BaseURL: server.URL}, plan, []openai.ChatCompletionMessageParamUnion{openai.UserMessage("hi")})
	if err == nil || err.Error() != "jevjam returned HTTP 400: images and videos need clef-flash; set model to clef-flash" {
		t.Fatalf("err = %v", err)
	}
}

func TestAskRejectsSystemMessage(t *testing.T) {
	plan, _ := NewPlan([]byte(`{"type": "object", "properties": {"churn": {"type": "boolean"}}}`), DefaultMaxScoreLevels)
	messages := []openai.ChatCompletionMessageParamUnion{openai.SystemMessage("be nice"), openai.UserMessage("hi")}
	if _, _, err := Ask(context.Background(), Config{BaseURL: "http://127.0.0.1:1"}, plan, messages); err == nil || !strings.Contains(err.Error(), "system message") {
		t.Fatalf("err = %v", err)
	}
}
