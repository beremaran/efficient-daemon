# AGENTS.md

Single-module Go CLI (`module efficient-daemon`, Go 1.27). Sends one chat-completion request to an OpenAI-compatible API with strict JSON-Schema structured output, then validates the response client-side.

## Commands

- Build: `make build` (or `go build -o bin/efficient-daemon ./cmd/efficient-daemon`)
- Test: `go test ./...` (single test: `go test -run TestName ./...`)
- No CI or lint config in this repo; format with `gofmt` (`make fmt`). Targets live in the `Makefile`: `build`, `test`, `fmt`, `vet`, `clean`, `help`.

## Runtime facts worth knowing

- Two subcommands: `ask [prompt]` runs the request flow (every request flag below belongs to it); `schema` prints the JSON Schema for context files. The same schema is checked in at `context.schema.json` (repo root) — a test keeps it byte-identical to `message.ContextFileSchema`.
- Defaults: model `Qwen3.5-2B` at `https://llm-desktop.kwilabs.net/v1`, API key `not-needed`, request timeout `5m`. No env vars or keys required; override with `--model`, `--base-url`, `--api-key`, `--timeout` (per request attempt — the SDK's retries each get the full budget; 0 disables the timeout).
- `--schema <file.json>` is required; the model response must be valid JSON and match the schema (validated with `santhosh-tekuri/jsonschema` in `internal/schema`).
- `--context <file>` (YAML/JSON) is mutually exclusive with prompt, `--system`, `--system-file`, `--user-file`, and `--image`.
- Tests are hermetic: the end-to-end test (`cmd/efficient-daemon/root_test.go`) uses an `httptest` server, so no network, model, or key is needed.

## Gotchas

- `internal/pdf` shells out to `pdftoppm` (Poppler) or `mutool` (MuPDF); PDF support fails without one of these system binaries installed.
- `internal/schema.Parse` intentionally keeps schema values as raw JSON so integer constraints survive serialization — don't round-trip schemas through `map[string]any` unmarshaling.
- The API requires the response schema `Name` to match `[a-zA-Z0-9_-]{1,64}`; `internal/core/ask.go` hardcodes `"response"` — keep a non-empty name if touching that code.
- `bin/` (via `make build`) holds the gitignored binary; there is no build artifact at the repo root.
