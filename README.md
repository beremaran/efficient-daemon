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

Every request needs an explicit OpenAI-compatible API base URL and model identifier. There are no base URL or model defaults. `--provider` defaults to `openai`; see [Ask jevjam](#ask-jevjam) for the other choice. An API key is optional; pass `--api-key` or set `OPENAI_API_KEY` when the provider requires authentication. If neither is set, no Authorization header is sent.

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

## Ask jevjam

[jevjam](https://github.com/beremaran/jevjam) runs small decision models that pick a label, rate on a scale, or answer yes or no, in milliseconds. Use `--provider jevjam` when your schema asks for decisions rather than free text:

```sh
efficient-daemon ask \
  --provider jevjam \
  --base-url https://jevjam.kwilabs.net \
  --schema triage.json \
  "We were billed twice for March. Refund it today or we cancel."
```

The base URL is the server root; `/v1/systemone` is added for you. `--model` is optional and maps to jevjam's model field (`english`, `julia-1`, `clef-flash`, and so on); without it, jevjam picks one. The API key comes from `--api-key` or `JEVJAM_API_KEY`, never from `OPENAI_API_KEY`.

Each property of the schema becomes one question, and its `description` becomes the question text:

| Property | Question | Value |
| --- | --- | --- |
| `string` with `enum` | `choice` | the top label |
| `string` with `oneOf` of `{"const", "description"}` | `choice`, with each description shown to the model | the top label |
| `boolean` | `noul` | `true` when the probability is at least 0.5 |
| `integer` with `minimum` and `maximum` | `score`, one level per value | the expected level, rounded |
| `integer` with `enum` | `score`, one level per value, low to high | the most likely level |
| `integer` with `oneOf` of `{"const", "description"}` | `score`, with each description as a level, low to high | the most likely level |

```json
{
  "type": "object",
  "properties": {
    "department": {
      "type": "string",
      "description": "Which department should handle this?",
      "oneOf": [
        { "const": "billing", "description": "invoices, payments, refunds" },
        { "const": "technical", "description": "bugs, outages" }
      ]
    },
    "churn_risk": { "type": "boolean", "description": "Does the user threaten to leave?" }
  },
  "required": ["department", "churn_risk"],
  "additionalProperties": false
}
```

The schema must be an object with 1 to 64 such properties; anything else fails before a request is sent. An integer may span at most 11 values unless you raise `--max-score-levels` (up to 64). Prefer `oneOf` for integers: bare numbers tell the model little about the scale, while labels like "not urgent", "soon", and "blocking" give much better scores. jevjam takes no system message and no sampling settings, so `--system`, `--system-file`, `--reasoning-effort`, `--temperature`, and `--max-tokens` are errors with this provider. Images and PDF pages are sent as images, which jevjam reads only with `--model clef-flash`.

## HTTP API and workbench

Start the service:

```sh
efficient-daemon serve \
  --host 127.0.0.1 \
  --port 8080 \
  --base-url https://api.example.com/v1 \
  --model your-model-id \
  --workbench
```

The browser workbench is at `http://127.0.0.1:8080/`. You can provide the model and base URL in the `serve` flags, or provide them on each `POST /ask` request. The API key can be set with `--api-key`, `OPENAI_API_KEY`, or per request. The `/config` endpoint deliberately does not return the API key. `POST /ask` also takes `provider` and `max-score-levels`. A request whose `provider` differs from the server's does not inherit the server's model, base URL, or API key. With jevjam, the response body stays the same unless the request sets `"answers": true`; then the body is `{"result": ..., "answers": ...}`, where `answers` holds jevjam's raw answers with probabilities and confidence. The workbench shows them in its Answers tab.

The API also exposes generated OpenAPI documentation at `/docs` and `/openapi.json`, plus `/schema/lint` for checking response schemas. The `serve` API has no authentication. Keep it bound to loopback unless you have protected network access in front of it; changing `--host` to a network interface allows clients that can reach that interface to submit requests.

## Docker

For a local build, copy `.env.example` to `.env`, set `EFFICIENT_DAEMON_BASE_URL` and `EFFICIENT_DAEMON_MODEL` if you want server-side request defaults, then start the service:

```sh
docker compose up --build -d
```

The API key is optional; set `EFFICIENT_DAEMON_API_KEY` only when the provider requires it. You can also leave the base URL and model unset and provide both with each `POST /ask` request. The workbench is at `http://localhost:8080/`, and the API docs are at `http://localhost:8080/docs`. Stop the service with `docker compose down`.

Each `serve` flag also accepts a matching `EFFICIENT_DAEMON_` environment variable; explicit CLI flags take precedence. Set `EFFICIENT_DAEMON_PUBLISHED_PORT` to change the host port, while `EFFICIENT_DAEMON_PORT` changes the port inside the container.

Each stable version tag publishes a multi-architecture image to `ghcr.io/beremaran/efficient-daemon`, tagged with its version and `latest`. For example, use `docker pull ghcr.io/beremaran/efficient-daemon:1.2.3` for version `v1.2.3`. The image includes Poppler for PDF input and runs as an unprivileged user.

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
