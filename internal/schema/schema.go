package schema

import (
	"bytes"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"

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

// StrictSubsetWarnings reports the paths of object schemas that omit
// additionalProperties: false, which the strict structured-output subset
// requires of every object. The check is best effort and advisory: $refs into
// external files are not resolved, and lenient servers may accept the schema
// anyway, so callers should warn rather than fail.
func StrictSubsetWarnings(raw []byte) []string {
	var doc any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil
	}
	var paths []string
	var walk func(node any, path string)
	walk = func(node any, path string) {
		switch n := node.(type) {
		case map[string]any:
			if isObjectNode(n) && n["additionalProperties"] != false {
				paths = append(paths, path)
			}
			keys := make([]string, 0, len(n))
			for key := range n {
				keys = append(keys, key)
			}
			sort.Strings(keys) // deterministic walk order
			for _, key := range keys {
				walk(n[key], path+"."+key)
			}
		case []any:
			for i, child := range n {
				walk(child, fmt.Sprintf("%s[%d]", path, i))
			}
		}
	}
	walk(doc, "$")
	return paths
}

// isObjectNode reports whether a schema node describes an object: it has
// properties, or its type is (or includes) "object".
func isObjectNode(node map[string]any) bool {
	if _, ok := node["properties"].(map[string]any); ok {
		return true
	}
	switch t := node["type"].(type) {
	case string:
		return t == "object"
	case []any:
		for _, one := range t {
			if one == "object" {
				return true
			}
		}
	}
	return false
}
