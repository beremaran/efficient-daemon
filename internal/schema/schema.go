package schema

import (
	"bytes"
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

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
// sourcePath is the file the bytes came from; it anchors relative $ref lookups
// to that file's directory rather than the process working directory. An empty
// sourcePath anchors to the working directory.
func Compile(raw []byte, sourcePath string) (*jsonschema.Schema, error) {
	name := "schema.json"
	if sourcePath != "" {
		if abs, err := filepath.Abs(sourcePath); err == nil {
			name = abs
		}
	}
	compiler := jsonschema.NewCompiler()
	if err := compiler.AddResource(name, bytes.NewReader(raw)); err != nil {
		return nil, fmt.Errorf("compile schema: %w", err)
	}
	sch, err := compiler.Compile(name)
	if err != nil {
		return nil, fmt.Errorf("compile schema: %w", err)
	}
	return sch, nil
}

// Validate checks that data conforms to the JSON Schema read from sourcePath.
func Validate(rawSchema []byte, data any, sourcePath string) error {
	sch, err := Compile(rawSchema, sourcePath)
	if err != nil {
		return err
	}
	return sch.Validate(data)
}
