package core

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

const (
	// DefaultTimeout bounds a single completion request. Zero disables it.
	DefaultTimeout = 5 * time.Minute
)

// Providers answer a request: an OpenAI-compatible LLM or a jevjam server.
const (
	ProviderOpenAI = "openai"
	ProviderJevjam = "jevjam"
)

// ValidateProvider accepts the known provider names.
func ValidateProvider(name string) error {
	if name != ProviderOpenAI && name != ProviderJevjam {
		return fmt.Errorf("invalid provider %q (want openai or jevjam)", name)
	}
	return nil
}

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

// ValidateBaseURL requires an explicit absolute HTTP(S) API base URL.
func ValidateBaseURL(raw string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "http" && parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || parsed.Fragment != "" {
		return fmt.Errorf("base URL must be an absolute HTTP or HTTPS URL with a host")
	}
	return nil
}

// NewClient builds a cancellable OpenAI-compatible client from the configuration.
func NewClient(cfg Config) (Client, error) {
	baseURL := strings.TrimSpace(cfg.BaseURL)
	if err := ValidateBaseURL(baseURL); err != nil {
		return Client{}, err
	}
	apiKey := cfg.APIKey
	if apiKey == "" {
		apiKey = os.Getenv("OPENAI_API_KEY")
	}
	opts := []option.RequestOption{option.WithBaseURL(baseURL)}
	if apiKey != "" {
		opts = append(opts, option.WithAPIKey(apiKey))
	}
	return Client{api: openai.NewClient(opts...), baseURL: strings.TrimRight(baseURL, "/"), apiKey: apiKey, timeout: cfg.Timeout}, nil
}

func (c Client) stopStream(conversationID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	endpoint := c.baseURL + "/stream?conv_id=" + url.QueryEscape(conversationID)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return err
	}
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
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
