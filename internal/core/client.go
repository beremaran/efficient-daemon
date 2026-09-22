package core

import (
	"time"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

const (
	// DefaultModel is used when the caller does not supply a model.
	DefaultModel = "Qwen3.5-2B"
	// DefaultBaseURL is the default chat-completions endpoint.
	DefaultBaseURL = "https://llm-desktop.kwilabs.net/v1"
	// DefaultTimeout bounds a single completion request. Zero disables it.
	DefaultTimeout = 5 * time.Minute
)

// Config holds the connection settings for the LLM client.
type Config struct {
	BaseURL string
	APIKey  string
	// Timeout bounds each request; zero or negative means no timeout.
	Timeout time.Duration
}

// NewClient builds an OpenAI client from the given configuration.
//
// Empty BaseURL falls back to DefaultBaseURL and empty APIKey falls back to a
// placeholder key, so callers can pass a zero Config to hit the defaults.
func NewClient(cfg Config) openai.Client {
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	apiKey := cfg.APIKey
	if apiKey == "" {
		apiKey = "not-needed"
	}
	opts := []option.RequestOption{
		option.WithBaseURL(baseURL),
		option.WithAPIKey(apiKey),
	}
	if cfg.Timeout > 0 {
		opts = append(opts, option.WithRequestTimeout(cfg.Timeout))
	}
	return openai.NewClient(opts...)
}
