package core

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/shared"
)

// Ask performs a structured-output completion using a Go type T as both the
// response schema and the unmarshal target, then decodes the result into *T.
func Ask[T any](botContext BotContext) (*T, error) {
	return askWith[T](NewClient(Config{}), botContext)
}

// askWith runs a structured-output completion against the given client and
// decodes the model's response into *T.
func askWith[T any](client openai.Client, botContext BotContext) (*T, error) {
	schema, err := GenerateSchema[T]()
	if err != nil {
		return nil, err
	}

	resp, err := chatCompletion(client, botContext, schema)
	if err != nil {
		return nil, err
	}

	var result T
	if err := json.Unmarshal([]byte(resp), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

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

// chatCompletion issues a single structured-output chat completion and returns
// the raw content string of the first choice.
func chatCompletion(client openai.Client, botContext BotContext, schema map[string]any) (string, error) {
	return chatCompletionContext(context.Background(), client, botContext, schema)
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
