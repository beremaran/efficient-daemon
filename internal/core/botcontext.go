package core

import "github.com/openai/openai-go/v3"

// BotContext bundles everything the model needs to produce a response: the
// model to use and the ordered list of chat messages.
type BotContext interface {
	Model() string
	Messages() []openai.ChatCompletionMessageParamUnion
}

// SimpleBotContext is a BotContext backed by a single system and a single user
// message. It is the simplest way to drive Ask/AskSchema.
type SimpleBotContext struct {
	systemMessage string
	userMessage   string
}

// NewSimpleBotContext returns a BotContext with the given system and user
// messages. An empty system message is omitted from the request.
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
	return DefaultModel
}

// MessagesContext is a BotContext built from an explicit model string and an
// arbitrary (possibly multimodal) list of messages.
type MessagesContext struct {
	model    string
	messages []openai.ChatCompletionMessageParamUnion
}

// NewMessagesContext returns a BotContext from a model id and messages. An empty
// model falls back to DefaultModel.
func NewMessagesContext(model string, messages []openai.ChatCompletionMessageParamUnion) BotContext {
	if model == "" {
		model = DefaultModel
	}
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
