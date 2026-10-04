# HTTP API and workbench

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

`POST /models` lists the models the target server offers. It takes `provider`, `base-url`, and `api-key`, with the same defaults as `POST /ask`, and returns `{"models": ["id", ...]}`. The daemon calls `GET /models` on the base URL, or `GET /v1/models` for jevjam, and a failure there returns 502 or 504. The workbench uses it to fill its Model select; it offers no free-text model name. The server must implement the endpoint for you to pick a model in the workbench.

The API also exposes generated OpenAPI documentation at `/docs` and `/openapi.json`, plus `/schema/lint` for checking response schemas. The `serve` API has no authentication. Keep it bound to loopback unless you have protected network access in front of it; changing `--host` to a network interface allows clients that can reach that interface to submit requests.
