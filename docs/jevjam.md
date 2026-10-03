# jevjam

[jevjam](https://github.com/beremaran/jevjam) runs small decision models that pick a label, rate on a scale, or answer yes or no, in milliseconds. Use `--provider jevjam` when your schema asks for decisions rather than free text:

```sh
efficient-daemon ask \
  --provider jevjam \
  --base-url http://localhost:8000 \
  --schema triage.json \
  "We were billed twice for March. Refund it today or we cancel."
```

The base URL is the server root; `/v1/systemone` is added for you. `--model` is optional and maps to jevjam's model field (`english`, `julia-1`, `clef-flash`, and so on); without it, jevjam picks one. The API key comes from `--api-key` or `JEVJAM_API_KEY`, never from `OPENAI_API_KEY`. `serve` does not read `JEVJAM_API_KEY`, so it never sends that key to a base URL a request names; set `--api-key` instead.

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

See [HTTP API](api.md) for the `answers` option of `POST /ask`.
