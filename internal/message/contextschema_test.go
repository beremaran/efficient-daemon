package message

import (
	"encoding/json"
	"testing"

	appschema "efficient-daemon/internal/schema"
)

func TestContextFileSchemaIsValidJSON(t *testing.T) {
	if !json.Valid([]byte(ContextFileSchema)) {
		t.Fatal("ContextFileSchema is not valid JSON")
	}
	var doc map[string]any
	if err := json.Unmarshal([]byte(ContextFileSchema), &doc); err != nil {
		t.Fatal(err)
	}
	if doc["type"] != "object" {
		t.Fatalf("root type = %v, want object", doc["type"])
	}
	defs, ok := doc["$defs"].(map[string]any)
	if !ok {
		t.Fatalf("$defs missing or not an object: %v", doc["$defs"])
	}
	for _, name := range []string{"message", "part"} {
		if _, ok := defs[name].(map[string]any); !ok {
			t.Fatalf("$defs.%s missing", name)
		}
	}
	part, _ := defs["part"].(map[string]any)
	if variants, _ := part["oneOf"].([]any); len(variants) != 3 {
		t.Fatalf("part.oneOf has %d variants, want 3 (text, image, pdf)", len(variants))
	}
	required, _ := doc["required"].([]any)
	if len(required) != 1 || required[0] != "user" {
		t.Fatalf("required = %v, want [user]", required)
	}
}

func TestContextFileSchemaValidatesDocuments(t *testing.T) {
	sch, err := appschema.Compile([]byte(ContextFileSchema), "")
	if err != nil {
		t.Fatalf("schema does not compile: %v", err)
	}
	decode := func(t *testing.T, doc string) any {
		t.Helper()
		var value any
		if err := json.Unmarshal([]byte(doc), &value); err != nil {
			t.Fatal(err)
		}
		return value
	}

	valid := map[string]string{
		"string messages":       `{"system":"Be brief.","user":"Summarize this."}`,
		"parts with everything": `{"user":{"parts":[{"text":"Look."},{"image":"https://example.com/cat.png"},{"image":"/tmp/a.png"},{"pdf":"doc.pdf"}]}}`,
		"no system":             `{"user":{"parts":[{"text":"hi"}]}}`,
	}
	for name, doc := range valid {
		if err := sch.Validate(decode(t, doc)); err != nil {
			t.Errorf("%s: valid document rejected: %v", name, err)
		}
	}

	invalid := map[string]string{
		"missing user":         `{"system":"x"}`,
		"empty text":           `{"user":{"parts":[{"text":""}]}}`,
		"two fields in a part": `{"user":{"parts":[{"text":"a","image":"b"}]},"extra":1}`,
		"unknown top key":      `{"user":"hi","partz":[]}`,
		"empty parts list":     `{"user":{"parts":[]}}`,
	}
	for name, doc := range invalid {
		if err := sch.Validate(decode(t, doc)); err == nil {
			t.Errorf("%s: invalid document accepted", name)
		}
	}
}
