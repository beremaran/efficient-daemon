package core

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
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
	// Timeout bounds the full completion stream; zero or negative means no timeout.
	Timeout time.Duration
}

// Client holds the OpenAI-compatible client and the endpoint details needed to
// stop a llama.cpp resumable stream after cancellation or timeout.
type Client struct {
	api     openai.Client
	baseURL string
	apiKey  string
	timeout time.Duration
}

// NewClient builds a cancellable OpenAI-compatible client from the configuration.
//
// Empty BaseURL falls back to DefaultBaseURL and empty APIKey falls back to a
// placeholder key, so callers can pass a zero Config to hit the defaults.
func NewClient(cfg Config) Client {
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
	return Client{api: openai.NewClient(opts...), baseURL: strings.TrimRight(baseURL, "/"), apiKey: apiKey, timeout: cfg.Timeout}
}

func (c Client) stopStream(conversationID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	endpoint := c.baseURL + "/stream?conv_id=" + url.QueryEscape(conversationID)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusMethodNotAllowed {
		return nil // The OpenAI-compatible server does not expose llama.cpp's stop API.
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("stop endpoint returned HTTP %d", resp.StatusCode)
	}
	return nil
}
