package message

import (
	"encoding/base64"
	"fmt"
	"mime"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"efficient-daemon/internal/pdf"
	"github.com/openai/openai-go/v3"
	"gopkg.in/yaml.v3"
)

type contextFile struct {
	System message `yaml:"system"`
	User   message `yaml:"user"`
}

type message struct {
	Parts []part `yaml:"parts"`
}

type part struct {
	Text  string `yaml:"text,omitempty"`
	Image string `yaml:"image,omitempty"`
	PDF   string `yaml:"pdf,omitempty"`
}

// UnmarshalYAML supports either a plain string or an object containing parts.
func (m *message) UnmarshalYAML(node *yaml.Node) error {
	if node.Kind == yaml.ScalarNode {
		var text string
		if err := node.Decode(&text); err != nil {
			return err
		}
		m.Parts = []part{{Text: text}}
		return nil
	}
	type plain message
	return node.Decode((*plain)(m))
}

// FromSimple builds messages from the command's text-oriented input mode.
func FromSimple(system, user string, images []string) ([]openai.ChatCompletionMessageParamUnion, error) {
	var result []openai.ChatCompletionMessageParamUnion
	if system != "" {
		result = append(result, openai.SystemMessage(system))
	}
	parts := []part{{Text: user}}
	for _, image := range images {
		parts = append(parts, part{Image: image})
	}
	userParts, err := buildParts(parts, "")
	if err != nil {
		return nil, err
	}
	return append(result, openai.UserMessage(userParts)), nil
}

// FromFile loads a YAML or JSON context document and resolves relative media
// paths relative to the document itself.
func FromFile(path string) ([]openai.ChatCompletionMessageParamUnion, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read context %q: %w", path, err)
	}
	var doc contextFile
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("parse context %q: %w", path, err)
	}
	base := filepath.Dir(path)
	var result []openai.ChatCompletionMessageParamUnion
	if len(doc.System.Parts) > 0 {
		var texts []string
		for _, p := range doc.System.Parts {
			if p.Text == "" || p.Image != "" || p.PDF != "" {
				return nil, fmt.Errorf("system message supports text parts only")
			}
			texts = append(texts, p.Text)
		}
		result = append(result, openai.SystemMessage(strings.Join(texts, "\n")))
	}
	if len(doc.User.Parts) == 0 {
		return nil, fmt.Errorf("context must contain a user message")
	}
	parts, err := buildParts(doc.User.Parts, base)
	if err != nil {
		return nil, err
	}
	return append(result, openai.UserMessage(parts)), nil
}

func buildParts(parts []part, base string) ([]openai.ChatCompletionContentPartUnionParam, error) {
	var result []openai.ChatCompletionContentPartUnionParam
	for i, p := range parts {
		count := 0
		if p.Text != "" {
			count++
		}
		if p.Image != "" {
			count++
		}
		if p.PDF != "" {
			count++
		}
		if count != 1 {
			return nil, fmt.Errorf("message part %d must set exactly one of text, image, or pdf", i+1)
		}
		switch {
		case p.Text != "":
			text := openai.ChatCompletionContentPartTextParam{Text: p.Text}
			result = append(result, openai.ChatCompletionContentPartUnionParam{OfText: &text})
		case p.Image != "":
			imageURL, err := resolveImage(p.Image, base)
			if err != nil {
				return nil, err
			}
			result = append(result, imagePart(imageURL))
		case p.PDF != "":
			path := resolvePath(p.PDF, base)
			pages, cleanup, err := pdf.Render(path)
			if err != nil {
				return nil, err
			}
			for _, page := range pages {
				imageURL, encodeErr := localDataURL(page)
				if encodeErr != nil {
					cleanup()
					return nil, encodeErr
				}
				result = append(result, imagePart(imageURL))
			}
			cleanup()
		}
	}
	return result, nil
}

func imagePart(value string) openai.ChatCompletionContentPartUnionParam {
	image := openai.ChatCompletionContentPartImageParam{ImageURL: openai.ChatCompletionContentPartImageImageURLParam{URL: value}}
	return openai.ChatCompletionContentPartUnionParam{OfImageURL: &image}
}

func resolveImage(value, base string) (string, error) {
	parsed, err := url.Parse(value)
	if err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https" || parsed.Scheme == "data") {
		return value, nil
	}
	return localDataURL(resolvePath(value, base))
}

func resolvePath(path, base string) string {
	if filepath.IsAbs(path) || base == "" {
		return path
	}
	return filepath.Join(base, path)
}

func localDataURL(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read image %q: %w", path, err)
	}
	mediaType := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
	if mediaType == "" {
		mediaType = "application/octet-stream"
	}
	return "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(raw), nil
}
