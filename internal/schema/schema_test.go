package schema

import (
	"encoding/json"
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
	} {
		t.Run(name, func(t *testing.T) {
			got := StrictSubsetWarnings([]byte(test.schema))
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
