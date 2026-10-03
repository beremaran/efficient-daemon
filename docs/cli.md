# CLI

`efficient-daemon ask` sends one request to an OpenAI-compatible API and checks the JSON reply against a JSON Schema before it prints it.

## Ask a model

Every request needs an explicit OpenAI-compatible API base URL and model identifier. There are no base URL or model defaults. `--provider` defaults to `openai`; see [jevjam](jevjam.md) for the other choice. An API key is optional; pass `--api-key` or set `OPENAI_API_KEY` when the provider requires authentication. If neither is set, no Authorization header is sent.

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

## Context files

Use `--context` to keep a request and its files together in a YAML or JSON document. Relative image and PDF paths resolve from the context file's directory:

```yaml
system: Extract the document's title and summary.
user:
  parts:
    - text: "Read this document."
    - pdf: ./report.pdf
```

The context file format is described by [`context.schema.json`](../context.schema.json) and printed by `efficient-daemon schema`. Images may be local files, HTTP(S) URLs, or data URLs. PDFs must be local files and are rasterized page by page before being sent.

PDF input requires either `pdftoppm` from Poppler or `mutool` from MuPDF on `PATH`. `pdfinfo` from Poppler is optional and lets the program reject oversized PDFs before rendering.

## Options

Useful options include `--system`, `--system-file`, `--user-file`, repeatable `--image`, `--reasoning-effort`, `--temperature`, `--max-tokens`, `--timeout`, and `--output`. Run `efficient-daemon ask --help` for the complete list.
