package message

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"efficient-daemon/internal/pdf"
	"github.com/openai/openai-go/v3"
	"gopkg.in/yaml.v3"
)

// Guard limits for inline media. They bound the size of a single request so a
// runaway attachment fails fast instead of producing an oversized payload.
const (
	maxImageBytes = 20 << 20 // 20 MiB per local image file
	maxPDFPages   = 100      // pages rasterized per PDF
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
	if node.Kind != yaml.MappingNode {
		return fmt.Errorf("expected a string or a mapping with a parts list")
	}
	if err := checkKeys(node, "parts"); err != nil {
		return err
	}
	type plain message
	return node.Decode((*plain)(m))
}

// UnmarshalYAML decodes a part and rejects unknown fields, since node.Decode
// ignores the surrounding decoder's KnownFields setting.
func (p *part) UnmarshalYAML(node *yaml.Node) error {
	if node.Kind != yaml.MappingNode {
		return fmt.Errorf("expected a mapping with one of text, image, or pdf")
	}
	if err := checkKeys(node, "text", "image", "pdf"); err != nil {
		return err
	}
	type plain part
	return node.Decode((*plain)(p))
}

// checkKeys rejects mapping keys outside the allowed set.
func checkKeys(node *yaml.Node, allowed ...string) error {
	for i := 0; i+1 < len(node.Content); i += 2 {
		key := node.Content[i].Value
		known := false
		for _, name := range allowed {
			if key == name {
				known = true
				break
			}
		}
		if !known {
			return fmt.Errorf("unknown field %q (allowed: %s)", key, strings.Join(allowed, ", "))
		}
	}
	return nil
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
	decoder := yaml.NewDecoder(bytes.NewReader(raw))
	decoder.KnownFields(true)
	if err := decoder.Decode(&doc); err != nil {
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
	if err == nil && parsed.Scheme == "data" {
		// Never echo the payload itself; data URLs can be megabytes long.
		lower := strings.ToLower(ref)
		if strings.HasPrefix(lower, "data:application/pdf") {
			return nil, fmt.Errorf("embedded PDF data URLs are not supported; save it to a local file and reference the path")
		}
		if !strings.HasPrefix(lower, "data:image/") {
			return nil, fmt.Errorf("unsupported data URL (only data:image/ URLs are accepted; save other content to a local file)")
		}
		return []openai.ChatCompletionContentPartUnionParam{imagePart(ref)}, nil
	}
	// A non-empty host distinguishes real URLs from scheme-like local paths
	// such as a file named "http:foo.png" (which url.Parse reports with an
	// empty Host).
	if err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != "" {
		if strings.HasSuffix(strings.ToLower(parsed.Path), ".pdf") {
			return nil, fmt.Errorf("remote PDF %q is not supported; save it to a local file and reference the path", ref)
		}
		return []openai.ChatCompletionContentPartUnionParam{imagePart(ref)}, nil
	}

	path := resolvePath(ref, base)
	// Stat before reading so an oversized or non-regular file is rejected
	// without loading it into memory. PDFs are bounded by page count instead
	// of byte size, so a large .pdf still reaches the rasterizer.
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("read image %q: %w", path, err)
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("image %q is not a regular file", path)
	}
	if strings.EqualFold(filepath.Ext(path), ".pdf") && info.Size() > maxImageBytes {
		return renderPDF(path)
	}
	if info.Size() > maxImageBytes {
		return nil, imageTooLarge(path, info.Size())
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read image %q: %w", path, err)
	}
	if isPDF(path, raw) {
		return renderPDF(path)
	}
	if len(raw) > maxImageBytes {
		return nil, imageTooLarge(path, int64(len(raw)))
	}
	dataURL, err := localDataURL(path, raw)
	if err != nil {
		return nil, err
	}
	return []openai.ChatCompletionContentPartUnionParam{imagePart(dataURL)}, nil
}

// renderPDF rasterizes a local PDF file and returns one image part per page.
func renderPDF(path string) ([]openai.ChatCompletionContentPartUnionParam, error) {
	pages, cleanup, err := pdf.Render(path, maxPDFPages)
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

func imageTooLarge(path string, size int64) error {
	return fmt.Errorf("image %q is %.1f MB; the maximum is %d MB", path, float64(size)/(1<<20), maxImageBytes/(1<<20))
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

// localDataURL encodes raw image bytes as a data URL after verifying the
// content is a supported raster format, since vision APIs accept only these.
func localDataURL(path string, raw []byte) (string, error) {
	mediaType, ok := imageMediaType(raw)
	if !ok {
		return "", fmt.Errorf("unsupported image format for %q; supported formats: png, jpeg, webp, gif", path)
	}
	return "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(raw), nil
}

// imageMediaType identifies supported image formats by magic bytes, so files
// with missing or misleading extensions are still handled correctly.
func imageMediaType(raw []byte) (string, bool) {
	switch {
	case bytes.HasPrefix(raw, []byte("\x89PNG\r\n\x1a\n")):
		return "image/png", true
	case bytes.HasPrefix(raw, []byte("\xff\xd8\xff")):
		return "image/jpeg", true
	case bytes.EqualFold(raw[:min(len(raw), 6)], []byte("GIF87a")) || bytes.EqualFold(raw[:min(len(raw), 6)], []byte("GIF89a")):
		return "image/gif", true
	case len(raw) >= 12 && bytes.EqualFold(raw[:4], []byte("RIFF")) && bytes.EqualFold(raw[8:12], []byte("WEBP")):
		return "image/webp", true
	default:
		return "", false
	}
}
