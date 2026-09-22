package output

import (
	"encoding/json"
	"fmt"
	"io"
)

func Write(w io.Writer, raw json.RawMessage, format string) error {
	var data []byte
	var err error
	switch format {
	case "json":
		data, err = compact(raw)
	case "json-pretty":
		var value any
		if err = json.Unmarshal(raw, &value); err == nil {
			data, err = json.MarshalIndent(value, "", "  ")
		}
	default:
		return fmt.Errorf("invalid output format %q (want json or json-pretty)", format)
	}
	if err != nil {
		return fmt.Errorf("format output: %w", err)
	}
	_, err = fmt.Fprintln(w, string(data))
	return err
}

func compact(raw []byte) ([]byte, error) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	return json.Marshal(value)
}
