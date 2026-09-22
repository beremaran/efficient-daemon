package output

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// Write renders raw JSON in the requested format: "json" for compact output or
// "json-pretty" for indented output. Formatting operates on the raw bytes so
// numbers, string escapes, and key order pass through unchanged.
func Write(w io.Writer, raw json.RawMessage, format string) error {
	var buf bytes.Buffer
	var err error
	switch format {
	case "json":
		err = json.Compact(&buf, raw)
	case "json-pretty":
		err = json.Indent(&buf, raw, "", "  ")
	default:
		return fmt.Errorf("invalid output format %q (want json or json-pretty)", format)
	}
	if err != nil {
		return fmt.Errorf("format output: %w", err)
	}
	buf.WriteByte('\n')
	_, err = w.Write(buf.Bytes())
	return err
}
