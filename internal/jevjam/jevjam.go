// Package jevjam answers a response schema with jevjam's small decision
// models (POST /v1/systemone) instead of an LLM. Each schema property becomes
// one typed question, and the answers map back into a value of the schema's
// shape, so callers validate it exactly as they validate LLM output.
package jevjam

import (
	"bytes"
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"math"
	"net/http"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/openai/openai-go/v3"
)

const (
	// DefaultMaxScoreLevels caps how many values a bounded integer may span.
	DefaultMaxScoreLevels = 11
	// MaxScoreLevelsLimit bounds max-score-levels, so no request can make a
	// plan allocate an unbounded number of levels.
	MaxScoreLevelsLimit = 64
	// maxQuestions is jevjam's per-request question limit.
	maxQuestions = 64
	// maxResponseBytes bounds the jevjam reply read into memory.
	maxResponseBytes = 10 << 20
)

// Config holds the connection settings for a jevjam server.
type Config struct {
	// BaseURL is the server root; /v1/systemone is appended.
	BaseURL string
	// APIKey falls back to JEVJAM_API_KEY, never OPENAI_API_KEY.
	APIKey string
	// Model is optional; jevjam routes the request itself when it is empty.
	Model string
	// Timeout bounds the request; zero or negative means no timeout.
	Timeout time.Duration
}

// Question is one jevjam question as sent on the wire.
type Question struct {
	Type         string `json:"type"`
	Instructions string `json:"instructions"`
	Criteria     any    `json:"criteria,omitempty"`
}

// Plan maps each schema property to its question and to the way its answer
// turns back into a schema value.
type Plan map[string]field

type field struct {
	question Question
	// levels holds the integer value of each score level, low to high.
	levels []int64
	// mean picks the rounded expected level, which suits a numeric range;
	// otherwise the most likely level wins, since labels are categories.
	mean bool
}

// answer holds the fields of a jevjam answer that map back to a value.
// Pointers tell a missing or null value apart from a real zero.
type answer struct {
	Choice        *string            `json:"choice"`
	Score         *float64           `json:"score"`
	Noul          *float64           `json:"noul"`
	Probabilities map[string]float64 `json:"probabilities"`
}

// ValidateMaxScoreLevels checks a max-score-levels setting.
func ValidateMaxScoreLevels(n int) error {
	if n < 2 || n > MaxScoreLevelsLimit {
		return fmt.Errorf("max-score-levels must be between 2 and %d", MaxScoreLevelsLimit)
	}
	return nil
}

// NewPlan translates a response schema into jevjam questions. The schema must
// be an object whose every property is a boolean (noul), an integer with
// minimum and maximum or oneOf consts spanning 2 to maxLevels values (score),
// or a string with enum or oneOf consts (choice).
func NewPlan(raw []byte, maxLevels int) (Plan, error) {
	if err := ValidateMaxScoreLevels(maxLevels); err != nil {
		return nil, err
	}
	var root struct {
		Type       any                       `json:"type"`
		Properties map[string]map[string]any `json:"properties"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&root); err != nil {
		return nil, fmt.Errorf("schema is not a valid JSON object: %w", err)
	}
	if root.Type != "object" {
		return nil, errors.New("jevjam needs a schema of type object")
	}
	if n := len(root.Properties); n == 0 || n > maxQuestions {
		return nil, fmt.Errorf("jevjam needs 1 to %d properties; the schema has %d", maxQuestions, n)
	}
	plan := Plan{}
	for name, prop := range root.Properties {
		f, err := newField(name, prop, maxLevels)
		if err != nil {
			return nil, fmt.Errorf("property %q: %w", name, err)
		}
		plan[name] = f
	}
	return plan, nil
}

func newField(name string, prop map[string]any, maxLevels int) (field, error) {
	instructions, _ := prop["description"].(string)
	q := Question{Instructions: cmp.Or(strings.TrimSpace(instructions), name)}
	switch {
	case prop["type"] == "boolean":
		q.Type = "noul"
		return field{question: q}, nil
	case prop["type"] == "integer" && (prop["oneOf"] != nil || prop["enum"] != nil):
		keyword, options := "oneOf", prop["oneOf"]
		if options == nil {
			keyword, options = "enum", prop["enum"]
		}
		items, _ := options.([]any)
		labels := map[int64]string{}
		for _, option := range items {
			item, ok := option.(map[string]any)
			if !ok {
				item = map[string]any{"const": option}
			}
			value, err := intKeyword(item, "const")
			if err != nil {
				return field{}, fmt.Errorf("every %s entry needs a whole-number value", keyword)
			}
			if _, dup := labels[value]; dup {
				return field{}, fmt.Errorf("%s lists %d twice", keyword, value)
			}
			description, _ := item["description"].(string)
			labels[value] = cmp.Or(strings.TrimSpace(description), strconv.FormatInt(value, 10))
		}
		if len(labels) < 2 || len(labels) > maxLevels {
			return field{}, fmt.Errorf("%s has %d values; jevjam allows 2 to %d (see max-score-levels)", keyword, len(labels), maxLevels)
		}
		levels := slices.Sorted(maps.Keys(labels))
		criteria := make([]string, len(levels))
		for i, value := range levels {
			criteria[i] = labels[value]
		}
		q.Type, q.Criteria = "score", criteria
		return field{question: q, levels: levels}, nil
	case prop["type"] == "integer":
		lo, loErr := intKeyword(prop, "minimum")
		hi, hiErr := intKeyword(prop, "maximum")
		if err := errors.Join(loErr, hiErr); err != nil {
			return field{}, err
		}
		if count := hi - lo + 1; count < 2 || count > int64(maxLevels) {
			return field{}, fmt.Errorf("integer range %d..%d spans %d values; jevjam allows 2 to %d (see max-score-levels)", lo, hi, count, maxLevels)
		}
		levels := make([]int64, hi-lo+1)
		criteria := make([]string, len(levels))
		for i := range levels {
			levels[i] = lo + int64(i)
			criteria[i] = strconv.FormatInt(levels[i], 10)
		}
		q.Type, q.Criteria = "score", criteria
		return field{question: q, levels: levels, mean: true}, nil
	case prop["type"] == "string" && prop["enum"] != nil:
		values, _ := prop["enum"].([]any)
		labels := make([]string, 0, len(values))
		for _, value := range values {
			label, ok := value.(string)
			if !ok {
				return field{}, errors.New("enum values must be strings")
			}
			labels = append(labels, label)
		}
		if len(labels) < 2 {
			return field{}, errors.New("enum needs at least 2 values")
		}
		q.Type, q.Criteria = "choice", labels
		return field{question: q}, nil
	case prop["type"] == "string" && prop["oneOf"] != nil:
		options, _ := prop["oneOf"].([]any)
		criteria := map[string]string{}
		for _, option := range options {
			item, _ := option.(map[string]any)
			label, ok := item["const"].(string)
			if !ok {
				return field{}, errors.New("every oneOf entry needs a string const")
			}
			if _, dup := criteria[label]; dup {
				return field{}, fmt.Errorf("oneOf lists %q twice", label)
			}
			description, _ := item["description"].(string)
			criteria[label] = cmp.Or(strings.TrimSpace(description), label)
		}
		if len(criteria) < 2 {
			return field{}, errors.New("oneOf needs at least 2 entries")
		}
		q.Type, q.Criteria = "choice", criteria
		return field{question: q}, nil
	}
	return field{}, errors.New("jevjam supports only boolean, bounded, enum, or oneOf integer, and string enum or oneOf properties")
}

func intKeyword(prop map[string]any, key string) (int64, error) {
	number, ok := prop[key].(json.Number)
	if !ok {
		return 0, fmt.Errorf("integer properties need a numeric %s", key)
	}
	value, err := number.Int64()
	if err != nil {
		return 0, fmt.Errorf("%s must be a whole number", key)
	}
	return value, nil
}

// values maps jevjam answers back into a schema-shaped JSON object.
func (p Plan) values(answers map[string]answer) (json.RawMessage, error) {
	out := make(map[string]any, len(p))
	for name, f := range p {
		a, ok := answers[name]
		if !ok {
			return nil, fmt.Errorf("jevjam returned no answer for %q", name)
		}
		switch {
		case f.question.Type == "noul" && a.Noul != nil:
			out[name] = *a.Noul >= 0.5
		case f.question.Type == "choice" && a.Choice != nil:
			out[name] = *a.Choice
		case f.question.Type == "score" && f.mean && a.Score != nil:
			out[name] = f.levels[min(max(int(math.Round(*a.Score)), 0), len(f.levels)-1)]
		case f.question.Type == "score" && !f.mean && len(a.Probabilities) == len(f.levels):
			top := 0
			for i := range f.levels {
				if a.Probabilities[strconv.Itoa(i)] > a.Probabilities[strconv.Itoa(top)] {
					top = i
				}
			}
			out[name] = f.levels[top]
		default:
			return nil, fmt.Errorf("jevjam returned no %s value for %q", f.question.Type, name)
		}
	}
	return json.Marshal(out)
}

// Ask sends the messages to jevjam and returns the schema-shaped result and
// jevjam's raw answers (probabilities and confidence included).
func Ask(ctx context.Context, cfg Config, plan Plan, messages []openai.ChatCompletionMessageParamUnion) (result, answers json.RawMessage, err error) {
	state, images, err := inputs(messages)
	if err != nil {
		return nil, nil, err
	}
	questions := make(map[string]Question, len(plan))
	for name, f := range plan {
		questions[name] = f.question
	}
	body, err := json.Marshal(struct {
		State     string              `json:"state"`
		Questions map[string]Question `json:"questions"`
		Model     string              `json:"model,omitempty"`
		Images    []string            `json:"images,omitempty"`
	}{state, questions, strings.TrimSpace(cfg.Model), images})
	if err != nil {
		return nil, nil, err
	}

	if cfg.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, cfg.Timeout)
		defer cancel()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")+"/v1/systemone", bytes.NewReader(body))
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if key := cmp.Or(cfg.APIKey, os.Getenv("JEVJAM_API_KEY")); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("jevjam returned HTTP %d: %s", resp.StatusCode, detail(raw))
	}

	var decoded struct {
		Answers json.RawMessage `json:"answers"`
	}
	var parsed map[string]answer
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, nil, fmt.Errorf("decode jevjam response: %w", err)
	}
	if err := json.Unmarshal(decoded.Answers, &parsed); err != nil {
		return nil, nil, fmt.Errorf("decode jevjam answers: %w", err)
	}
	result, err = plan.values(parsed)
	return result, decoded.Answers, err
}

// inputs flattens chat messages into jevjam's state text and image list.
func inputs(messages []openai.ChatCompletionMessageParamUnion) (string, []string, error) {
	var texts, images []string
	for _, m := range messages {
		if m.OfSystem != nil {
			return "", nil, errors.New("jevjam takes no system message")
		}
		if m.OfUser == nil {
			continue
		}
		if m.OfUser.Content.OfString.Valid() {
			texts = append(texts, m.OfUser.Content.OfString.Value)
		}
		for _, part := range m.OfUser.Content.OfArrayOfContentParts {
			if part.OfText != nil {
				texts = append(texts, part.OfText.Text)
			}
			if part.OfImageURL != nil {
				images = append(images, part.OfImageURL.ImageURL.URL)
			}
		}
	}
	return strings.Join(texts, "\n\n"), images, nil
}

// detail extracts jevjam's error message, falling back to the raw body.
func detail(raw []byte) string {
	var body struct {
		Detail string `json:"detail"`
	}
	if json.Unmarshal(raw, &body) == nil && body.Detail != "" {
		return body.Detail
	}
	return strings.TrimSpace(string(raw))
}
