package core

import "github.com/openai/openai-go/v3"

type BotContext interface {
	Model() string
	Messages() []openai.ChatCompletionMessageParamUnion
}

type SimpleBotContext struct {
	systemMessage string
	userMessage   string
}

func NewSimpleBotContext(systemMessage, userMessage string) BotContext {
	return &SimpleBotContext{
		systemMessage: systemMessage,
		userMessage:   userMessage,
	}
}

// Messages implements [BotContext].
func (s *SimpleBotContext) Messages() []openai.ChatCompletionMessageParamUnion {
	var messages []openai.ChatCompletionMessageParamUnion

	if s.systemMessage != "" {
		messages = append(messages, openai.SystemMessage(s.systemMessage))
	}

	return append(messages, openai.UserMessage(s.userMessage))
}

// Model implements [BotContext].
func (s *SimpleBotContext) Model() string {
	return DEFAULT_MODEL
}
