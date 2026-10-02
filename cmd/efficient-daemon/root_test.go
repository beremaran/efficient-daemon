package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeCompletionStream(w http.ResponseWriter, content string) {
	w.Header().Set("Content-Type", "text/event-stream")
	_, _ = fmt.Fprintf(w, "data: {\"id\":\"test\",\"object\":\"chat.completion.chunk\",\"created\":0,\"model\":\"test\",\"choices\":[{\"index\":0,\"delta\":{\"content\":%q},\"finish_reason\":\"stop\"}]}\n\n", content)
	_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
}

func TestValidateInputs(t *testing.T) {
	tests := []struct {
		name    string
		opts    options
		args    []string
		wantErr bool
	}{
		{name: "prompt", opts: options{provider: "openai", baseURL: "https://example.com/v1", model: "test", output: "json-pretty"}, args: []string{"hello"}},
		{name: "context", opts: options{provider: "openai", baseURL: "https://example.com/v1", model: "test", output: "json", context: "context.yaml"}},
		{name: "missing input", opts: options{provider: "openai", baseURL: "https://example.com/v1", model: "test", output: "json-pretty"}, wantErr: true},
		{name: "mixed modes", opts: options{provider: "openai", baseURL: "https://example.com/v1", model: "test", output: "json-pretty", context: "context.yaml", system: "x"}, wantErr: true},
		{name: "invalid output", opts: options{provider: "openai", baseURL: "https://example.com/v1", model: "test", output: "yaml"}, args: []string{"hello"}, wantErr: true},
		{name: "jevjam without model", opts: options{provider: "jevjam", baseURL: "https://example.com", output: "json"}, args: []string{"hello"}},
		{name: "openai without model", opts: options{provider: "openai", baseURL: "https://example.com/v1", output: "json"}, args: []string{"hello"}, wantErr: true},
		{name: "unknown provider", opts: options{provider: "other", baseURL: "https://example.com/v1", model: "test", output: "json"}, args: []string{"hello"}, wantErr: true},
		{name: "negative timeout", opts: options{provider: "openai", baseURL: "https://example.com/v1", model: "test", output: "json-pretty", timeout: -time.Second}, args: []string{"hello"}, wantErr: true},
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
		writeCompletionStream(w, `{"i":123456789012345678}`)
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
		cmd.SetArgs([]string{"ask", "--base-url", "http://127.0.0.1:1", "--model", "test", "--schema", schemaPath, "--temperature", value, "hello"})
		err := cmd.Execute()
		if err == nil || !strings.Contains(err.Error(), "--temperature must be between 0 and 2") {
			t.Fatalf("temperature %s: got %v, want range error", value, err)
		}
	}
}

func TestCommandHonorsTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		_, _ = io.Copy(io.Discard, r.Body)
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
		writeCompletionStream(w, `{"answer":"yes"}`)
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

func TestServeRejectsInvalidConfig(t *testing.T) {
	// Invalid configuration must fail before the listener starts, so these
	// return instead of blocking on an open port.
	for _, args := range [][]string{
		{"serve", "--temperature=2.5"},
		{"serve", "--max-tokens=-1"},
		{"serve", "--timeout=-1s"},
		{"serve", "--reasoning-effort=ultra"},
	} {
		cmd := newRootCommand()
		cmd.SetArgs(args)
		if err := cmd.Execute(); err == nil {
			t.Fatalf("%v: expected error", args)
		}
	}
}

func TestServeEnvironmentUsesEnvDefaultsAndRespectsFlags(t *testing.T) {
	for _, name := range []string{
		"EFFICIENT_DAEMON_HOST", "EFFICIENT_DAEMON_PORT", "EFFICIENT_DAEMON_BASE_URL",
		"EFFICIENT_DAEMON_MODEL", "EFFICIENT_DAEMON_API_KEY", "EFFICIENT_DAEMON_REASONING_EFFORT",
		"EFFICIENT_DAEMON_TEMPERATURE", "EFFICIENT_DAEMON_MAX_TOKENS", "EFFICIENT_DAEMON_TIMEOUT",
		"EFFICIENT_DAEMON_WORKBENCH",
	} {
		t.Setenv(name, "")
	}
	t.Setenv("EFFICIENT_DAEMON_HOST", "0.0.0.0")
	t.Setenv("EFFICIENT_DAEMON_PORT", "9090")
	t.Setenv("EFFICIENT_DAEMON_API_KEY", "env-key")
	t.Setenv("EFFICIENT_DAEMON_TEMPERATURE", "0")
	t.Setenv("EFFICIENT_DAEMON_MAX_TOKENS", "64")
	t.Setenv("EFFICIENT_DAEMON_TIMEOUT", "45s")
	t.Setenv("EFFICIENT_DAEMON_WORKBENCH", "true")

	cmd := newServeCommand()
	if err := cmd.Flags().Parse([]string{"--host", "127.0.0.2"}); err != nil {
		t.Fatal(err)
	}
	if err := applyServeEnv(cmd); err != nil {
		t.Fatal(err)
	}
	flags := cmd.Flags()
	if got, _ := flags.GetString("host"); got != "127.0.0.2" {
		t.Fatalf("host = %q, want explicit flag value", got)
	}
	if got, _ := flags.GetInt("port"); got != 9090 {
		t.Fatalf("port = %d, want env value 9090", got)
	}
	if got, _ := flags.GetString("api-key"); got != "env-key" {
		t.Fatalf("api-key = %q, want env value", got)
	}
	if got, _ := flags.GetFloat64("temperature"); got != 0 || !flags.Changed("temperature") {
		t.Fatalf("temperature = %v, changed = %v, want explicit env zero", got, flags.Changed("temperature"))
	}
	if got, _ := flags.GetInt64("max-tokens"); got != 64 {
		t.Fatalf("max-tokens = %d, want env value 64", got)
	}
	if got, _ := flags.GetDuration("timeout"); got != 45*time.Second {
		t.Fatalf("timeout = %v, want env value 45s", got)
	}
	if got, _ := flags.GetBool("workbench"); !got {
		t.Fatal("workbench = false, want env value true")
	}
}

func TestCommandJevjamEndToEnd(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"answers":{"leave":{"noul":0.9}}}`)
	}))
	defer server.Close()

	schemaPath := filepath.Join(t.TempDir(), "schema.json")
	if err := os.WriteFile(schemaPath, []byte(`{"type":"object","properties":{"leave":{"type":"boolean"}},"required":["leave"]}`), 0o600); err != nil {
		t.Fatal(err)
	}

	cmd := newRootCommand()
	var stdout bytes.Buffer
	cmd.SetOut(&stdout)
	cmd.SetArgs([]string{"ask", "--provider", "jevjam", "--base-url", server.URL, "--schema", schemaPath, "--output", "json", "hello"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	if got, want := stdout.String(), "{\"leave\":true}\n"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}

	cmd = newRootCommand()
	cmd.SetArgs([]string{"ask", "--provider", "jevjam", "--base-url", server.URL, "--schema", schemaPath, "--max-tokens", "5", "hello"})
	if err := cmd.Execute(); err == nil || !strings.Contains(err.Error(), "--max-tokens does not apply") {
		t.Fatalf("err = %v", err)
	}
}
