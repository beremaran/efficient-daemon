# efficient-daemon

`efficient-daemon` is a Go CLI and local HTTP service for sending prompts to an OpenAI-compatible API and validating its structured JSON response against a JSON Schema.

It accepts text, images, and PDFs, supports both command-line and HTTP workflows, and includes an optional browser workbench.

## Install

Install the latest tagged version with Go:

```sh
go install github.com/beremaran/efficient-daemon/cmd/efficient-daemon@latest
```

Or build from a checkout (Go version is specified in `go.mod`):

```sh
make build
```

PDF input requires either `pdftoppm` from Poppler or `mutool` from MuPDF on `PATH`. `pdfinfo` from Poppler is optional and lets the program reject oversized PDFs before rendering.

## Ask a model

Every request needs an explicit OpenAI-compatible API base URL and model identifier. There are no provider or model defaults. An API key is optional; pass `--api-key` or set `OPENAI_API_KEY` when the provider requires authentication. If neither is set, no Authorization header is sent.

Create a response schema such as `schema.json`:

```json
{
  "type": "object",
  "properties": {
    "answer": { "type": "string" }
  },
  "required": ["answer"],
  "additionalProperties": false
}
```

Then make a request:

```sh
efficient-daemon ask \
  --base-url https://api.example.com/v1 \
  --model your-model-id \
  --api-key "$OPENAI_API_KEY" \
  --schema schema.json \
  "Summarize the main idea in one sentence."
```

`--api-key` can be omitted for providers that do not require authentication. The response is checked against the schema before it is printed. Providers that implement strict structured output may support only a subset of JSON Schema; `efficient-daemon` reports likely incompatibilities before sending the request.

Use `--context` to keep a request and its files together in a YAML or JSON document. Relative image and PDF paths resolve from the context file's directory:

```yaml
system: Extract the document's title and summary.
user:
  parts:
    - text: "Read this document."
    - pdf: ./report.pdf
```

The context file format is described by [`context.schema.json`](context.schema.json) and printed by `efficient-daemon schema`. Images may be local files, HTTP(S) URLs, or data URLs. PDFs must be local files and are rasterized page by page before being sent.

Useful options include `--system`, `--system-file`, `--user-file`, repeatable `--image`, `--reasoning-effort`, `--temperature`, `--max-tokens`, `--timeout`, and `--output`. Run `efficient-daemon ask --help` for the complete list.

## HTTP API and workbench

Start the service with local upstream defaults:

```sh
efficient-daemon serve \
  --host 127.0.0.1 \
  --port 8080 \
  --base-url https://api.example.com/v1 \
  --model your-model-id \
  --workbench
```

The browser workbench is at `http://127.0.0.1:8080/`. You can provide the model and base URL in the `serve` flags, or provide them on each `POST /ask` request. The API key can be set with `--api-key`, `OPENAI_API_KEY`, or per request. The `/config` endpoint deliberately does not return the API key.

The API also exposes generated OpenAPI documentation at `/docs` and `/openapi.json`, plus `/schema/lint` for checking response schemas. The `serve` API has no authentication. Keep it bound to loopback unless you have protected network access in front of it; changing `--host` to a network interface allows clients that can reach that interface to submit requests.

## Development

Requirements: the Go version in `go.mod`, Node.js 24+, and npm 11+.

```sh
make test
make vet
make build
cd web && npm ci && npm run lint && npm run build
```

The workbench build is embedded in the Go binary and committed at `internal/workbench/dist`. Its build strips WebAssembly debug sections so local build paths are not included. Run `make build-web` after changing the workbench. Third-party license notices are listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), served at `/THIRD_PARTY_NOTICES.md` in the workbench, and included in release archives. Run `make licenses` after changing dependencies.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and [SECURITY.md](SECURITY.md) for vulnerability reports.

## License

The project is licensed under the MIT License. See [LICENSE](LICENSE).
