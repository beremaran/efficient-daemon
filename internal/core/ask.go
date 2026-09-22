package core

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/shared"
)

// RequestOptions carries optional per-request sampling and reasoning controls.
// An empty ReasoningEffort defaults to high; nil pointers omit the parameter
// entirely so the server's default applies.
type RequestOptions struct {
	ReasoningEffort string
	Temperature     *float64
	MaxTokens       *int64
}

// AskSchema performs a structured-output completion using an arbitrary JSON
// schema (rather than a Go type) and returns the model's raw JSON content. The
// caller is responsible for validating the result against the schema.
func AskSchema(ctx context.Context, client openai.Client, botContext BotContext, schema map[string]any, opts RequestOptions) (json.RawMessage, error) {
	resp, err := chatCompletionContext(ctx, client, botContext, schema, opts)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(resp), nil
}

func chatCompletionContext(ctx context.Context, client openai.Client, botContext BotContext, schema map[string]any, opts RequestOptions) (string, error) {
	effort, err := reasoningEffort(opts.ReasoningEffort)
	if err != nil {
		return "", err
	}
	params := openai.ChatCompletionNewParams{
		Messages: botContext.Messages(),
		ResponseFormat: openai.ChatCompletionNewParamsResponseFormatUnion{
			OfJSONSchema: &shared.ResponseFormatJSONSchemaParam{
				JSONSchema: shared.ResponseFormatJSONSchemaJSONSchemaParam{
					// The API requires a non-empty name matching
					// [a-zA-Z0-9_-]{1,64}; the zero value is rejected.
					Name:   "response",
					Schema: schema,
					Strict: openai.Bool(true),
				},
			},
		},
		Model:           botContext.Model(),
		ReasoningEffort: effort,
	}
	if opts.Temperature != nil {
		params.Temperature = openai.Float(*opts.Temperature)
	}
	if opts.MaxTokens != nil {
		// Deliberately max_tokens rather than max_completion_tokens: the
		// OpenAI-compatible servers this targets (vLLM and similar) accept
		// max_tokens everywhere, while some of them reject
		// max_completion_tokens outright. Flip this if the target becomes
		// a newer OpenAI model that requires max_completion_tokens.
		params.MaxTokens = openai.Int(*opts.MaxTokens)
	}

	resp, err := client.Chat.Completions.New(ctx, params)
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("model returned no choices")
	}

	return resp.Choices[0].Message.Content, nil
}

// reasoningEffort maps a CLI-level effort name to the SDK union value. An empty
// name preserves the historical default of high.
func reasoningEffort(name string) (openai.ReasoningEffort, error) {
	switch name {
	case "", "high":
		return openai.ReasoningEffortHigh, nil
	case "none":
		return openai.ReasoningEffortNone, nil
	case "minimal":
		return openai.ReasoningEffortMinimal, nil
	case "low":
		return openai.ReasoningEffortLow, nil
	case "medium":
		return openai.ReasoningEffortMedium, nil
	case "xhigh":
		return openai.ReasoningEffortXhigh, nil
	case "max":
		return openai.ReasoningEffortMax, nil
	default:
		return "", fmt.Errorf("invalid reasoning effort %q (want none, minimal, low, medium, high, xhigh, or max)", name)
	}
}

// ValidateReasoningEffort reports whether name is a valid effort setting
// without performing a request. An empty name is valid and keeps the default.
func ValidateReasoningEffort(name string) error {
	_, err := reasoningEffort(name)
	return err
}
