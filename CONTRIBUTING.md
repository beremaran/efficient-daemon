# Contributing

Issues and pull requests are welcome. For larger changes, open an issue first so the scope can be discussed. Please keep reports free of API keys, private prompts, and customer data.

## Development setup

- Install the Go version listed in `go.mod`.
- Install Node.js 24+ and npm 11+ to work on the browser workbench and refresh license notices.
- Install Poppler (`pdftoppm`) or MuPDF (`mutool`) to run PDF-related behavior locally.

Common checks:

```sh
make test
make vet
make build
cd web && npm ci && npm run lint && npm run build
```

The workbench output is embedded by Go and committed under `internal/workbench/dist`. Regenerate it with `make build-web` when changing `web/`.

After changing Go or npm dependencies, refresh the third-party license inventory with `make licenses` and commit the updated `THIRD_PARTY_LICENSES/` files and `THIRD_PARTY_NOTICES.md`.

## Pull requests

- Keep changes focused and update documentation when behavior or configuration changes.
- Add or adjust focused tests for behavior changes.
- Ensure Go code is `gofmt`-formatted and run the relevant checks above.
- Include a screenshot for user-visible workbench changes.
- Describe the change, why it is needed, and checks performed.

There is no CLA or DCO requirement. Contributions are accepted under the project's MIT License. All participants are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
