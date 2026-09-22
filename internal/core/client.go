package core

import (
	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

const DEFAULT_MODEL = "Qwen3.5-2B"

func CreateClient() openai.Client {
	return openai.NewClient(
		option.WithBaseURL("https://llm-desktop.kwilabs.net/v1"),
		option.WithAPIKey("not-needed"),
	)
}
