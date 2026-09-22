package schema

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

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

// StrictSubsetWarnings reports the locations of object schemas that omit
// additionalProperties: false, which the strict structured-output subset
// requires of every object. Only schema-bearing keywords are traversed, so
// annotation values (const, default, examples, enum) are never mistaken for
// schemas. External $ref targets are loaded best effort relative to
// sourcePath: local files only, capped in size, cycles skipped, and missing
// refs ignored. The result is advisory — some servers accept schemas that
// stricter endpoints reject.
func StrictSubsetWarnings(raw []byte, sourcePath string) []string {
	root := decodeObject(raw)
	if root == nil {
		return nil
	}
	var warnings []string
	visited := map[string]bool{}
	rootFile := absoluteSchemaPath(sourcePath)
	visited[rootFile+"#"] = true

	var walk func(node map[string]any, location, currentFile string)
	walk = func(node map[string]any, location, currentFile string) {
		if isObjectNode(node) && node["additionalProperties"] != false {
			warnings = append(warnings, location)
		}
		// Keywords whose values are maps of schemas (property/definition
		// names to schemas).
		for _, key := range schemaMapKeys {
			dict, ok := node[key].(map[string]any)
			if !ok {
				continue
			}
			for _, name := range sortedKeys(dict) {
				if child, ok := dict[name].(map[string]any); ok {
					walk(child, location+"."+key+"."+name, currentFile)
				}
			}
		}
		// Keywords whose value is a schema or an array of schemas.
		for _, key := range schemaValueKeys {
			switch value := node[key].(type) {
			case map[string]any:
				walk(value, location+"."+key, currentFile)
			case []any:
				for i, element := range value {
					if child, ok := element.(map[string]any); ok {
						walk(child, fmt.Sprintf("%s.%s[%d]", location, key, i), currentFile)
					}
				}
			}
		}
		if ref, ok := node["$ref"].(string); ok {
			walkRef(ref, currentFile, visited, walk)
		}
	}
	walk(root, "$", rootFile)
	return warnings
}

// walkRef follows an external $ref to its target schema, best effort. Internal
// ("#/...") and remote ("scheme://...") refs are skipped: internal targets are
// reached structurally, and remote files are neither fetched nor guessed.
func walkRef(ref, currentFile string, visited map[string]bool, walk func(map[string]any, string, string)) {
	base, fragment, _ := strings.Cut(ref, "#")
	if base == "" || strings.Contains(base, "://") {
		return
	}
	targetFile := base
	if !filepath.IsAbs(targetFile) {
		targetFile = filepath.Join(filepath.Dir(currentFile), base)
	}
	if abs, err := filepath.Abs(targetFile); err == nil {
		targetFile = abs
	}
	key := targetFile + "#" + fragment
	if visited[key] {
		return
	}
	visited[key] = true

	raw, err := readFileCap(targetFile, maxRefBytes)
	if err != nil {
		return
	}
	target := decodeObject(raw)
	if target == nil {
		return
	}
	// Navigate to the fragment, e.g. "#/$defs/Fee".
	segments := strings.Split(strings.TrimPrefix(fragment, "/"), "/")
	for _, segment := range segments {
		if segment == "" {
			break
		}
		child, ok := target[segment].(map[string]any)
		if !ok {
			return
		}
		target = child
	}
	walk(target, base+"#"+fragment, targetFile)
}

// schemaMapKeys are keywords holding a map of name to schema.
var schemaMapKeys = []string{
	"properties", "patternProperties", "$defs", "definitions",
	"dependencies", "dependentSchemas",
}

// schemaValueKeys are keywords holding a schema or an array of schemas.
var schemaValueKeys = []string{
	"items", "prefixItems", "not", "additionalProperties", "additionalItems",
	"contains", "if", "then", "else", "propertyNames",
	"unevaluatedProperties", "unevaluatedItems",
	"allOf", "anyOf", "oneOf",
}

// maxRefBytes caps reads of externally referenced schema files.
const maxRefBytes = 10 << 20

func decodeObject(raw []byte) map[string]any {
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil
	}
	return doc
}

func absoluteSchemaPath(sourcePath string) string {
	if sourcePath == "" {
		sourcePath = "schema.json"
	}
	if abs, err := filepath.Abs(sourcePath); err == nil {
		return abs
	}
	return sourcePath
}

func readFileCap(path string, limit int64) ([]byte, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > limit {
		return nil, fmt.Errorf("ref target %q is not a regular file within %d bytes", path, limit)
	}
	return os.ReadFile(path)
}

func sortedKeys(dict map[string]any) []string {
	keys := make([]string, 0, len(dict))
	for key := range dict {
		keys = append(keys, key)
	}
	sort.Strings(keys) // deterministic walk order
	return keys
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

// ValidateValue decodes raw JSON with UseNumber (preserving integer precision
// for constraints like const or maximum) and validates the decoded value
// against the compiled schema.
func ValidateValue(sch *jsonschema.Schema, raw []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return fmt.Errorf("model returned invalid JSON: %w", err)
	}
	if _, err := decoder.Token(); err != io.EOF {
		return fmt.Errorf("model returned invalid JSON: trailing data after value")
	}
	if err := sch.Validate(value); err != nil {
		return fmt.Errorf("model response does not match schema: %w", err)
	}
	return nil
}
