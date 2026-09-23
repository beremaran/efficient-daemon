package core

import "github.com/openai/openai-go/v3"

// BotContext bundles everything the model needs to produce a response: the
// model to use and the ordered list of chat messages.
type BotContext interface {
	Model() string
	Messages() []openai.ChatCompletionMessageParamUnion
}

// MessagesContext is a BotContext built from an explicit model string and an
// arbitrary (possibly multimodal) list of messages.
type MessagesContext struct {
	model    string
	messages []openai.ChatCompletionMessageParamUnion
}

// NewMessagesContext returns a BotContext from an explicit model id and messages.
func NewMessagesContext(model string, messages []openai.ChatCompletionMessageParamUnion) BotContext {
	return &MessagesContext{model: model, messages: messages}
}

// Messages implements [BotContext].
func (m *MessagesContext) Messages() []openai.ChatCompletionMessageParamUnion {
	return m.messages
}

// Model implements [BotContext].
func (m *MessagesContext) Model() string {
	return m.model
}
