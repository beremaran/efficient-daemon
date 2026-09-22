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

func TestWritePreservesNumbersAndKeyOrder(t *testing.T) {
	raw := json.RawMessage(`{"big":123456789012345678,"i":1.0,"e":1e2,"z":"<b>"}`)
	want := `{"big":123456789012345678,"i":1.0,"e":1e2,"z":"<b>"}` + "\n"
	var buffer bytes.Buffer
	if err := Write(&buffer, raw, "json"); err != nil {
		t.Fatal(err)
	}
	if got := buffer.String(); got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}
