package schema

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestStrictSubsetWarnings(t *testing.T) {
	for name, test := range map[string]struct {
		schema string
		want   []string
	}{
		"conforming": {
			schema: `{"type":"object","properties":{"a":{"type":"object","properties":{},"additionalProperties":false}},"additionalProperties":false}`,
		},
		"missing at root": {
			schema: `{"type":"object","properties":{"a":{"type":"string"}}}`,
			want:   []string{"$"},
		},
		"missing nested": {
			schema: `{"type":"object","properties":{"a":{"type":"object","properties":{}}},"additionalProperties":false}`,
			want:   []string{"$.properties.a"},
		},
		"type union with object": {
			schema: `{"type":["object","null"],"properties":{}}`,
			want:   []string{"$"},
		},
		"annotation values are not schemas": {
			schema: `{"type":"object","properties":{"a":{"const":{"properties":{"x":1}},"default":{"type":"object"},"examples":[{"type":"object"}]}},"additionalProperties":false}`,
		},
		"allOf and tuple items": {
			schema: `{"allOf":[{"type":"object","properties":{}}],"items":[{"type":"object","properties":{}}]}`,
			want:   []string{"$.items[0]", "$.allOf[0]"},
		},
	} {
		t.Run(name, func(t *testing.T) {
			got := StrictSubsetWarnings([]byte(test.schema), "")
			if len(got) != len(test.want) {
				t.Fatalf("got %v, want %v", got, test.want)
			}
			for i := range got {
				if got[i] != test.want[i] {
					t.Fatalf("got %v, want %v", got, test.want)
				}
			}
		})
	}
}

func TestStrictSubsetWarningsResolvesExternalRefs(t *testing.T) {
	dir := t.TempDir()
	defs := `{"$defs":{"Fee":{"type":"object","properties":{}}}}`
	if err := os.WriteFile(filepath.Join(dir, "defs.json"), []byte(defs), 0o600); err != nil {
		t.Fatal(err)
	}
	schema := `{"type":"object","properties":{"f":{"$ref":"defs.json#/$defs/Fee"}},"additionalProperties":false}`
	schemaPath := filepath.Join(dir, "schema.json")

	got := StrictSubsetWarnings([]byte(schema), schemaPath)
	want := []string{"defs.json#/$defs/Fee"}
	if len(got) != 1 || got[0] != want[0] {
		t.Fatalf("got %v, want %v", got, want)
	}

	// A conforming target produces no warning.
	conforming := `{"$defs":{"Fee":{"type":"object","properties":{},"additionalProperties":false}}}`
	if err := os.WriteFile(filepath.Join(dir, "defs.json"), []byte(conforming), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := StrictSubsetWarnings([]byte(schema), schemaPath); len(got) != 0 {
		t.Fatalf("got %v, want no warnings", got)
	}

	// A missing ref file is skipped silently.
	_ = os.Remove(filepath.Join(dir, "defs.json"))
	if got := StrictSubsetWarnings([]byte(schema), schemaPath); len(got) != 0 {
		t.Fatalf("got %v, want no warnings for missing ref", got)
	}
}

func TestStrictSubsetWarningsSkipsRemoteRefs(t *testing.T) {
	schema := `{"type":"object","properties":{"f":{"$ref":"https://example.com/schema.json#/$defs/Fee"}},"additionalProperties":false}`
	if got := StrictSubsetWarnings([]byte(schema), ""); len(got) != 0 {
		t.Fatalf("got %v, want no warnings for remote ref", got)
	}
}

func TestValidate(t *testing.T) {
	raw := []byte(`{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}`)
	sch, err := Compile(raw, "")
	if err != nil {
		t.Fatal(err)
	}
	var valid any
	if err := json.Unmarshal([]byte(`{"answer":"yes"}`), &valid); err != nil {
		t.Fatal(err)
	}
	if err := sch.Validate(valid); err != nil {
		t.Fatalf("valid response rejected: %v", err)
	}

	var invalid any
	if err := json.Unmarshal([]byte(`{"other":"no"}`), &invalid); err != nil {
		t.Fatal(err)
	}
	if err := sch.Validate(invalid); err == nil {
		t.Fatal("invalid response accepted")
	}
}
