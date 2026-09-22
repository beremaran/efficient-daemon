package output

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestWriteFormats(t *testing.T) {
	raw := json.RawMessage(`{"answer":"yes"}`)
	for _, test := range []struct{ format, want string }{
		{"json", "{\"answer\":\"yes\"}\n"},
		{"json-pretty", "{\n  \"answer\": \"yes\"\n}\n"},
	} {
		t.Run(test.format, func(t *testing.T) {
			var buffer bytes.Buffer
			if err := Write(&buffer, raw, test.format); err != nil {
				t.Fatal(err)
			}
			if got := buffer.String(); got != test.want {
				t.Fatalf("got %q, want %q", got, test.want)
			}
		})
	}
}
