package main

import (
	"encoding/json"
	"fmt"
	"os"

	"efficient-daemon/internal/core"
	"efficient-daemon/internal/message"
	"efficient-daemon/internal/output"
	responseschema "efficient-daemon/internal/schema"
	"github.com/openai/openai-go/v3"
	"github.com/spf13/cobra"
)

type options struct {
	baseURL    string
	model      string
	apiKey     string
	schema     string
	context    string
	system     string
	systemFile string
	userFile   string
	images     []string
	output     string
}

func newRootCommand() *cobra.Command {
	var opts options
	cmd := &cobra.Command{
		Use:           "efficient-daemon [prompt]",
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

	flags := cmd.PersistentFlags()
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
	_ = cmd.MarkPersistentFlagRequired("schema")
	return cmd
}

func validateInputs(opts options, args []string) error {
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

	messages, err := buildMessages(opts, args)
	if err != nil {
		return err
	}
	client := core.NewClient(core.Config{BaseURL: opts.baseURL, APIKey: opts.apiKey})
	botContext := core.NewMessagesContext(opts.model, messages)
	raw, err := core.AskSchema(cmd.Context(), client, botContext, schemaMap)
	if err != nil {
		return fmt.Errorf("ask model: %w", err)
	}

	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return fmt.Errorf("model returned invalid JSON: %w", err)
	}
	if err := sch.Validate(value); err != nil {
		return fmt.Errorf("model response does not match schema: %w", err)
	}
	return output.Write(cmd.OutOrStdout(), raw, opts.output)
}

func buildMessages(opts options, args []string) ([]openai.ChatCompletionMessageParamUnion, error) {
	if opts.context != "" {
		return message.FromFile(opts.context)
	}
	system := opts.system
	if opts.systemFile != "" {
		raw, err := os.ReadFile(opts.systemFile)
		if err != nil {
			return nil, fmt.Errorf("read system message %q: %w", opts.systemFile, err)
		}
		system = string(raw)
	}
	user := ""
	if len(args) == 1 {
		user = args[0]
	}
	if opts.userFile != "" {
		raw, err := os.ReadFile(opts.userFile)
		if err != nil {
			return nil, fmt.Errorf("read user message %q: %w", opts.userFile, err)
		}
		user = string(raw)
	}
	return message.FromSimple(system, user, opts.images)
}
