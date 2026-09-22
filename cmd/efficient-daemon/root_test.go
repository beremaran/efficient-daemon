package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestValidateInputs(t *testing.T) {
	tests := []struct {
		name    string
		opts    options
		args    []string
		wantErr bool
	}{
		{name: "prompt", opts: options{output: "json-pretty"}, args: []string{"hello"}},
		{name: "context", opts: options{output: "json", context: "context.yaml"}},
		{name: "missing input", opts: options{output: "json-pretty"}, wantErr: true},
		{name: "mixed modes", opts: options{output: "json-pretty", context: "context.yaml", system: "x"}, wantErr: true},
		{name: "invalid output", opts: options{output: "yaml"}, args: []string{"hello"}, wantErr: true},
		{name: "negative timeout", opts: options{output: "json-pretty", timeout: -time.Second}, args: []string{"hello"}, wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateInputs(test.opts, test.args)
			if (err != nil) != test.wantErr {
				t.Fatalf("error = %v, wantErr %v", err, test.wantErr)
			}
		})
	}
}

func TestDecodeResponseKeepsIntegerPrecision(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"id":"test","object":"chat.completion","created":0,"model":"test","choices":[{"index":0,"message":{"role":"assistant","content":"{\"i\":123456789012345678}"},"finish_reason":"stop"}]}`)
	}))
	defer server.Close()

	schemaPath := filepath.Join(t.TempDir(), "schema.json")
	schema := `{"type":"object","properties":{"i":{"const":123456789012345678}},"required":["i"],"additionalProperties":false}`
	if err := os.WriteFile(schemaPath, []byte(schema), 0o600); err != nil {
		t.Fatal(err)
	}

	cmd := newRootCommand()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetArgs([]string{"ask", "--base-url", server.URL, "--model", "test", "--schema", schemaPath, "hello"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("large integer failed validation: %v", err)
	}
	if got, want := stdout.String(), "{\n  \"i\": 123456789012345678\n}\n"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestReadPromptFileGuards(t *testing.T) {
	dir := t.TempDir()

	big := filepath.Join(dir, "big.txt")
	file, err := os.Create(big)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(maxTextBytes + 1); err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
	if _, err := readPromptFile("user message", big); err == nil {
		t.Fatal("expected oversized prompt file error")
	}

	if _, err := readPromptFile("system message", os.DevNull); err == nil {
		t.Fatal("expected non-regular file error")
	}
}

func TestRunRejectsOutOfRangeTemperature(t *testing.T) {
	schemaPath := filepath.Join(t.TempDir(), "schema.json")
	if err := os.WriteFile(schemaPath, []byte(`{"type":"object"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{"-0.5", "2.5"} {
		cmd := newRootCommand()
		cmd.SetArgs([]string{"ask", "--base-url", "http://127.0.0.1:1", "--schema", schemaPath, "--temperature", value, "hello"})
		err := cmd.Execute()
		if err == nil || !strings.Contains(err.Error(), "--temperature must be between 0 and 2") {
			t.Fatalf("temperature %s: got %v, want range error", value, err)
		}
	}
}

func TestCommandHonorsTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(2 * time.Second):
		case <-r.Context().Done():
		}
	}))
	defer server.Close()

	schemaPath := filepath.Join(t.TempDir(), "schema.json")
	if err := os.WriteFile(schemaPath, []byte(`{"type":"object"}`), 0o600); err != nil {
		t.Fatal(err)
	}

	cmd := newRootCommand()
	cmd.SetArgs([]string{"ask", "--base-url", server.URL, "--model", "test", "--schema", schemaPath, "--timeout", "100ms", "hello"})
	start := time.Now()
	err := cmd.Execute()
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("request took %v, want failure near the 100ms timeout", elapsed)
	}
}

func TestSchemaCommandPrintsContextSchema(t *testing.T) {
	cmd := newRootCommand()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetArgs([]string{"schema"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &doc); err != nil {
		t.Fatalf("output is not valid JSON: %v\n%s", err, stdout.String())
	}
	if doc["type"] != "object" {
		t.Fatalf("root type = %v, want object", doc["type"])
	}
}

func TestAskStillRequiresSchemaFlag(t *testing.T) {
	cmd := newRootCommand()
	cmd.SetArgs([]string{"ask", "hello"})
	if err := cmd.Execute(); err == nil {
		t.Fatal("expected required --schema flag error")
	}
}

func TestCommandEndToEnd(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"id":"test","object":"chat.completion","created":0,"model":"test","choices":[{"index":0,"message":{"role":"assistant","content":"{\"answer\":\"yes\"}"},"finish_reason":"stop"}]}`)
	}))
	defer server.Close()

	schemaPath := filepath.Join(t.TempDir(), "schema.json")
	schema := `{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}`
	if err := os.WriteFile(schemaPath, []byte(schema), 0o600); err != nil {
		t.Fatal(err)
	}

	cmd := newRootCommand()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetArgs([]string{"ask", "--base-url", server.URL, "--model", "test", "--schema", schemaPath, "--output", "json", "hello"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if got, want := stdout.String(), "{\"answer\":\"yes\"}\n"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}
