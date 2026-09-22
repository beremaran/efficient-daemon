package schema

import (
	"encoding/json"
	"testing"
)

func TestValidate(t *testing.T) {
	raw := []byte(`{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}`)
	var valid any
	if err := json.Unmarshal([]byte(`{"answer":"yes"}`), &valid); err != nil {
		t.Fatal(err)
	}
	if err := Validate(raw, valid, ""); err != nil {
		t.Fatalf("valid response rejected: %v", err)
	}

	var invalid any
	if err := json.Unmarshal([]byte(`{"other":"no"}`), &invalid); err != nil {
		t.Fatal(err)
	}
	if err := Validate(raw, invalid, ""); err == nil {
		t.Fatal("invalid response accepted")
	}
}
