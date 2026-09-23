package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"efficient-daemon/internal/core"
	"efficient-daemon/internal/message"
	"efficient-daemon/internal/output"
	responseschema "efficient-daemon/internal/schema"
	"efficient-daemon/internal/server"
	"efficient-daemon/internal/workbench"
	"github.com/openai/openai-go/v3"
	"github.com/spf13/cobra"
)

type options struct {
	baseURL         string
	model           string
	apiKey          string
	schema          string
	context         string
	system          string
	systemFile      string
	userFile        string
	images          []string
	output          string
	reasoningEffort string
	temperature     float64
	maxTokens       int64
	timeout         time.Duration
}

// version is the CLI version reported by --version. Override at build time
// with -ldflags "-X main.version=v1.2.3".
var version = "0.1.0"

// maxTextBytes bounds prompt files the same way media files are bounded.
const maxTextBytes = 10 << 20 // 10 MiB per prompt file

func newRootCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:           "efficient-daemon",
		Short:         "Structured-output LLM client",
		Version:       version,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	cmd.AddCommand(newAskCommand(), newSchemaCommand(), newServeCommand())
	return cmd
}

func newAskCommand() *cobra.Command {
	var opts options
	cmd := &cobra.Command{
		Use:           "ask [prompt]",
		Short:         "Query an LLM with a structured response schema",
		SilenceUsage:  true,
		SilenceErrors: true,
		Args: func(cmd *cobra.Command, args []string) error {
			if len(args) > 1 {
				return fmt.Errorf("accepts at most one prompt argument")
			}
			return validateInputs(opts, args)
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			return run(cmd, opts, args)
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&opts.baseURL, "base-url", core.DefaultBaseURL, "OpenAI-compatible API base URL")
	flags.StringVar(&opts.model, "model", core.DefaultModel, "model identifier")
	flags.StringVar(&opts.apiKey, "api-key", "not-needed", "API key")
	flags.StringVar(&opts.schema, "schema", "", "JSON Schema file for the response (required)")
	flags.StringVar(&opts.context, "context", "", "YAML or JSON context file")
	flags.StringVar(&opts.system, "system", "", "system message")
	flags.StringVar(&opts.systemFile, "system-file", "", "read the system message from a file")
	flags.StringVar(&opts.userFile, "user-file", "", "read the user message from a file")
	flags.StringArrayVar(&opts.images, "image", nil, "image URL or local image path (repeatable)")
	flags.StringVar(&opts.output, "output", "json-pretty", "output format: json or json-pretty")
	flags.StringVar(&opts.reasoningEffort, "reasoning-effort", "high", "reasoning effort: none, minimal, low, medium, high, xhigh, or max")
	flags.Float64Var(&opts.temperature, "temperature", 0, "sampling temperature; omit to use the server default")
	flags.Int64Var(&opts.maxTokens, "max-tokens", 0, "maximum tokens to generate")
	flags.DurationVar(&opts.timeout, "timeout", core.DefaultTimeout, "timeout per request attempt (retries each get the full budget); 0 disables it")
	_ = cmd.MarkFlagRequired("schema")
	return cmd
}

func newSchemaCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "schema",
		Short: "Print the JSON Schema for context files",
		Long: "Print the JSON Schema for context files.\n\n" +
			"The identical schema is checked into the repository as context.schema.json, " +
			"and a test keeps the two in sync.",
		SilenceUsage:  true,
		SilenceErrors: true,
		Args:          cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			_, err := fmt.Fprintln(cmd.OutOrStdout(), message.ContextFileSchema)
			return err
		},
	}
}

func validateInputs(opts options, args []string) error {
	if opts.timeout < 0 {
		return fmt.Errorf("--timeout must not be negative")
	}
	if opts.output != "json" && opts.output != "json-pretty" {
		return fmt.Errorf("invalid --output %q (want json or json-pretty)", opts.output)
	}
	if opts.context != "" {
		if len(args) > 0 || opts.system != "" || opts.systemFile != "" || opts.userFile != "" || len(opts.images) > 0 {
			return fmt.Errorf("--context is mutually exclusive with prompt, --system, --system-file, --user-file, and --image")
		}
		return nil
	}
	if opts.system != "" && opts.systemFile != "" {
		return fmt.Errorf("--system and --system-file are mutually exclusive")
	}
	if len(args) > 0 && opts.userFile != "" {
		return fmt.Errorf("prompt and --user-file are mutually exclusive")
	}
	if len(args) == 0 && opts.userFile == "" {
		return fmt.Errorf("provide a prompt, --user-file, or --context")
	}
	return nil
}

func run(cmd *cobra.Command, opts options, args []string) error {
	rawSchema, err := os.ReadFile(opts.schema)
	if err != nil {
		return fmt.Errorf("read schema %q: %w", opts.schema, err)
	}
	schemaMap, err := responseschema.Parse(rawSchema)
	if err != nil {
		return err
	}
	sch, err := responseschema.Compile(rawSchema, opts.schema)
	if err != nil {
		return err
	}
	for _, warning := range responseschema.StrictSubsetWarnings(rawSchema, opts.schema) {
		fmt.Fprintf(cmd.ErrOrStderr(), "warning: %s is an object without additionalProperties: false; strict structured output may reject this schema\n", warning)
	}

	messages, err := buildMessages(opts, args)
	if err != nil {
		return err
	}
	client := core.NewClient(core.Config{BaseURL: opts.baseURL, APIKey: opts.apiKey, Timeout: opts.timeout})
	botContext := core.NewMessagesContext(opts.model, messages)
	req := core.RequestOptions{ReasoningEffort: opts.reasoningEffort}
	if cmd.Flags().Changed("temperature") {
		// The OpenAI-compatible range is 0-2; reject anything else before
		// spending a request on a provider-side error.
		if opts.temperature < 0 || opts.temperature > 2 {
			return fmt.Errorf("--temperature must be between 0 and 2")
		}
		temperature := opts.temperature
		req.Temperature = &temperature
	}
	if cmd.Flags().Changed("max-tokens") {
		if opts.maxTokens <= 0 {
			return fmt.Errorf("--max-tokens must be positive")
		}
		maxTokens := opts.maxTokens
		req.MaxTokens = &maxTokens
	}
	raw, err := core.AskSchema(cmd.Context(), client, botContext, schemaMap, req)
	if err != nil {
		return fmt.Errorf("ask model: %w", err)
	}
	if err := responseschema.ValidateValue(sch, raw); err != nil {
		return err
	}
	return output.Write(cmd.OutOrStdout(), raw, opts.output)
}

func buildMessages(opts options, args []string) ([]openai.ChatCompletionMessageParamUnion, error) {
	if opts.context != "" {
		return message.FromFile(opts.context)
	}
	system := opts.system
	if opts.systemFile != "" {
		var err error
		system, err = readPromptFile("system message", opts.systemFile)
		if err != nil {
			return nil, err
		}
	}
	user := ""
	if len(args) == 1 {
		user = args[0]
	}
	if opts.userFile != "" {
		var err error
		user, err = readPromptFile("user message", opts.userFile)
		if err != nil {
			return nil, err
		}
	}
	return message.FromSimple(system, user, opts.images)
}

// readPromptFile loads a prompt file only after confirming it is a regular
// file within the size limit, so a stray disk image or device path fails fast
// instead of being read into memory (or blocking forever).
func readPromptFile(kind, path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("read %s %q: %w", kind, path, err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%s %q is not a regular file", kind, path)
	}
	if info.Size() > maxTextBytes {
		return "", fmt.Errorf("%s %q is %.1f MB; the maximum is %d MB", kind, path, float64(info.Size())/(1<<20), maxTextBytes/(1<<20))
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read %s %q: %w", kind, path, err)
	}
	return string(raw), nil
}

func newServeCommand() *cobra.Command {
	var cfg server.Config
	var temperature float64
	var maxTokens int64
	var workbench bool
	cmd := &cobra.Command{
		Use:           "serve",
		Short:         "Serve the ask flow over HTTP with generated OpenAPI docs",
		SilenceUsage:  true,
		SilenceErrors: true,
		Args:          cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			flags := cmd.Flags()
			if flags.Changed("temperature") {
				cfg.Temperature = &temperature
			}
			if flags.Changed("max-tokens") {
				cfg.MaxTokens = &maxTokens
			}
			cfg.Workbench = workbench
			return runServe(cmd, cfg)
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&cfg.Host, "host", "127.0.0.1", "host or interface to listen on")
	flags.IntVar(&cfg.Port, "port", 8080, "port to listen on")
	// Everything below is a request default; any POST /ask field overrides it.
	flags.StringVar(&cfg.BaseURL, "base-url", core.DefaultBaseURL, "OpenAI-compatible API base URL")
	flags.StringVar(&cfg.Model, "model", core.DefaultModel, "model identifier")
	flags.StringVar(&cfg.APIKey, "api-key", "not-needed", "API key")
	flags.StringVar(&cfg.ReasoningEffort, "reasoning-effort", "high", "reasoning effort: none, minimal, low, medium, high, xhigh, or max")
	flags.Float64Var(&temperature, "temperature", 0, "sampling temperature; omit to use the server default")
	flags.Int64Var(&maxTokens, "max-tokens", 0, "maximum tokens to generate")
	flags.DurationVar(&cfg.Timeout, "timeout", core.DefaultTimeout, "timeout per request attempt (retries each get the full budget); 0 disables it")
	flags.BoolVar(&workbench, "workbench", false, "serve the interactive workbench UI at / (assets are embedded)")
	return cmd
}

func runServe(cmd *cobra.Command, cfg server.Config) error {
	cfg.Version = version
	handler, err := server.New(cfg)
	if err != nil {
		return err
	}
	if cfg.Workbench {
		handler = workbench.Handler(handler)
	}
	listener, err := net.Listen("tcp", net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port)))
	if err != nil {
		return fmt.Errorf("listen on %s:%d: %w", cfg.Host, cfg.Port, err)
	}
	srv := &http.Server{Handler: handler}
	ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()
	fmt.Fprintf(cmd.OutOrStdout(), "serving on http://%s (API docs at /docs)%s\n", listener.Addr(), map[bool]string{true: ", workbench UI at /", false: ""}[cfg.Workbench])
	if err := srv.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
