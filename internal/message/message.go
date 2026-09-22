package message

import (
	"bytes"
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

// FromSimple builds messages from the command's text-oriented input mode. The
// user text may be empty when images are present, allowing image-only prompts.
func FromSimple(system, user string, images []string) ([]openai.ChatCompletionMessageParamUnion, error) {
	var result []openai.ChatCompletionMessageParamUnion
	if system != "" {
		result = append(result, openai.SystemMessage(system))
	}
	var parts []part
	if user != "" {
		parts = append(parts, part{Text: user})
	}
	for _, image := range images {
		parts = append(parts, part{Image: image})
	}
	if len(parts) == 0 {
		return nil, fmt.Errorf("user message is empty")
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
		for i, p := range doc.System.Parts {
			if p.Image != "" || p.PDF != "" {
				return nil, fmt.Errorf("system message supports text parts only")
			}
			if p.Text == "" {
				return nil, fmt.Errorf("system message part %d is empty", i+1)
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
		switch {
		case count == 0:
			return nil, fmt.Errorf("message part %d is empty (set exactly one of text, image, or pdf)", i+1)
		case count > 1:
			return nil, fmt.Errorf("message part %d must set only one of text, image, or pdf", i+1)
		}
		switch {
		case p.Text != "":
			text := openai.ChatCompletionContentPartTextParam{Text: p.Text}
			result = append(result, openai.ChatCompletionContentPartUnionParam{OfText: &text})
		case p.Image != "":
			imageParts, err := imageParts(p.Image, base)
			if err != nil {
				return nil, err
			}
			result = append(result, imageParts...)
		case p.PDF != "":
			pdfResult, err := renderPDF(resolvePath(p.PDF, base))
			if err != nil {
				return nil, err
			}
			result = append(result, pdfResult...)
		}
	}
	return result, nil
}

// imageParts resolves an image reference into one or more image parts. Local
// PDF files are rasterized page by page; remote or data-URL PDFs are rejected
// because they cannot be rasterized without first writing them to disk.
func imageParts(ref, base string) ([]openai.ChatCompletionContentPartUnionParam, error) {
	parsed, err := url.Parse(ref)
	if err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https" || parsed.Scheme == "data") {
		isRemotePDF := parsed.Scheme == "data" && strings.HasPrefix(strings.ToLower(ref), "data:application/pdf")
		isURLPDF := parsed.Scheme != "data" && strings.HasSuffix(strings.ToLower(parsed.Path), ".pdf")
		if isRemotePDF || isURLPDF {
			return nil, fmt.Errorf("remote PDF %q is not supported; save it to a local file and reference the path", ref)
		}
		return []openai.ChatCompletionContentPartUnionParam{imagePart(ref)}, nil
	}

	path := resolvePath(ref, base)
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read image %q: %w", path, err)
	}
	if isPDF(path, raw) {
		return renderPDF(path)
	}
	dataURL, err := localDataURL(path, raw)
	if err != nil {
		return nil, err
	}
	return []openai.ChatCompletionContentPartUnionParam{imagePart(dataURL)}, nil
}

// renderPDF rasterizes a local PDF file and returns one image part per page.
func renderPDF(path string) ([]openai.ChatCompletionContentPartUnionParam, error) {
	pages, cleanup, err := pdf.Render(path)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	result := make([]openai.ChatCompletionContentPartUnionParam, 0, len(pages))
	for _, page := range pages {
		raw, readErr := os.ReadFile(page)
		if readErr != nil {
			return nil, fmt.Errorf("read rendered page %q: %w", page, readErr)
		}
		dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(raw)
		result = append(result, imagePart(dataURL))
	}
	return result, nil
}

func isPDF(path string, raw []byte) bool {
	return strings.EqualFold(filepath.Ext(path), ".pdf") || bytes.HasPrefix(raw, []byte("%PDF"))
}

func imagePart(value string) openai.ChatCompletionContentPartUnionParam {
	image := openai.ChatCompletionContentPartImageParam{ImageURL: openai.ChatCompletionContentPartImageImageURLParam{URL: value}}
	return openai.ChatCompletionContentPartUnionParam{OfImageURL: &image}
}

func resolvePath(path, base string) string {
	if filepath.IsAbs(path) || base == "" {
		return path
	}
	return filepath.Join(base, path)
}

func localDataURL(path string, raw []byte) (string, error) {
	mediaType := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
	if mediaType == "" {
		mediaType = "application/octet-stream"
	}
	return "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(raw), nil
}
