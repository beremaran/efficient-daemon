package core

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/shared"
)

// AskSchema performs a structured-output completion using an arbitrary JSON
// schema (rather than a Go type) and returns the model's raw JSON content. The
// caller is responsible for validating the result against the schema.
func AskSchema(ctx context.Context, client openai.Client, botContext BotContext, schema map[string]any) (json.RawMessage, error) {
	resp, err := chatCompletionContext(ctx, client, botContext, schema)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(resp), nil
}

func chatCompletionContext(ctx context.Context, client openai.Client, botContext BotContext, schema map[string]any) (string, error) {
	resp, err := client.Chat.Completions.New(
		ctx,
		openai.ChatCompletionNewParams{
			Messages: botContext.Messages(),
			ResponseFormat: openai.ChatCompletionNewParamsResponseFormatUnion{
				OfJSONSchema: &shared.ResponseFormatJSONSchemaParam{
					JSONSchema: shared.ResponseFormatJSONSchemaJSONSchemaParam{
						Name:   "response",
						Schema: schema,
						Strict: openai.Bool(true),
					},
				},
			},
			Model:           botContext.Model(),
			ReasoningEffort: openai.ReasoningEffortHigh,
		},
	)
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("model returned no choices")
	}

	return resp.Choices[0].Message.Content, nil
}
