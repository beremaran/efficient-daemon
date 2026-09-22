package schema

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

// Load reads a JSON Schema document from path and returns it as a generic map
// suitable for passing to the LLM SDK. Integer constraints are preserved so they
// survive the round-trip through the SDK's request serialization.
func Load(path string) (map[string]any, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read schema %q: %w", path, err)
	}
	return Parse(raw)
}

// Parse parses raw JSON Schema bytes into a generic map.
func Parse(raw []byte) (map[string]any, error) {
	// Preserve schema values as raw JSON so integer constraints are not rounded
	// through float64 before the SDK serializes the request.
	var typed map[string]json.RawMessage
	if err := json.Unmarshal(raw, &typed); err != nil {
		return nil, fmt.Errorf("schema is not a valid JSON object: %w", err)
	}
	result := make(map[string]any, len(typed))
	for key, value := range typed {
		result[key] = value
	}
	return result, nil
}

// Compile builds a validated *jsonschema.Schema from raw JSON Schema bytes.
func Compile(raw []byte) (*jsonschema.Schema, error) {
	compiler := jsonschema.NewCompiler()
	if err := compiler.AddResource("schema.json", bytes.NewReader(raw)); err != nil {
		return nil, fmt.Errorf("compile schema: %w", err)
	}
	sch, err := compiler.Compile("schema.json")
	if err != nil {
		return nil, fmt.Errorf("compile schema: %w", err)
	}
	return sch, nil
}

// Validate checks that data conforms to the given JSON Schema.
func Validate(rawSchema []byte, data any) error {
	sch, err := Compile(rawSchema)
	if err != nil {
		return err
	}
	return sch.Validate(data)
}
