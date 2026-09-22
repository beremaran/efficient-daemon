package core

import (
	"context"
	"encoding/json"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/shared"
)

func Ask[T any](botContext BotContext) (*T, error) {
	schema, err := GenerateSchema[T]()
	if err != nil {
		return nil, err
	}

	client := CreateClient()

	resp, err := client.Chat.Completions.New(
		context.TODO(),
		openai.ChatCompletionNewParams{
			Messages: botContext.Messages(),
			ResponseFormat: openai.ChatCompletionNewParamsResponseFormatUnion{
				OfJSONSchema: &shared.ResponseFormatJSONSchemaParam{
					JSONSchema: shared.ResponseFormatJSONSchemaJSONSchemaParam{
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
		return nil, err
	}

	output := resp.Choices[0].Message.Content

	var botResponse T
	if err := json.Unmarshal([]byte(output), &botResponse); err != nil {
		return nil, err
	}

	return &botResponse, nil
}
