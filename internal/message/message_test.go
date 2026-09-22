package message

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFromFileResolvesTextAndLocalImage(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "image.png"), []byte("png"), 0o600); err != nil {
		t.Fatal(err)
	}
	context := "system: Be concise.\nuser:\n  parts:\n    - text: Describe this.\n    - image: image.png\n"
	path := filepath.Join(dir, "context.yaml")
	if err := os.WriteFile(path, []byte(context), 0o600); err != nil {
		t.Fatal(err)
	}

	messages, err := FromFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 2 {
		t.Fatalf("got %d messages, want 2", len(messages))
	}
}

func TestFromFileRejectsNonTextSystemPart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "context.yaml")
	context := "system:\n  parts:\n    - image: image.png\nuser: hello\n"
	if err := os.WriteFile(path, []byte(context), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := FromFile(path); err == nil {
		t.Fatal("expected system image error")
	}
}
