package main

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
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
	cmd.SetArgs([]string{"--base-url", server.URL, "--model", "test", "--schema", schemaPath, "hello"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("large integer failed validation: %v", err)
	}
	if got, want := stdout.String(), "{\n  \"i\": 123456789012345678\n}\n"; got != want {
		t.Fatalf("got %q, want %q", got, want)
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
	cmd.SetArgs([]string{"--base-url", server.URL, "--model", "test", "--schema", schemaPath, "--output", "json", "hello"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if got, want := stdout.String(), "{\"answer\":\"yes\"}\n"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}
