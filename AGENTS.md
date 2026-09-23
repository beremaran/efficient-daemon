# Repository Guidelines

## Project Structure & Module Organization

This repository is a single-module Go CLI (`efficient-daemon`, Go 1.27). The
CLI entrypoint and Cobra commands live in `cmd/efficient-daemon`. Domain code
is organized under `internal/`: `core` handles requests, `message` handles
context files, `schema` validates JSON Schema, `server` exposes the HTTP API,
`pdf` handles PDF input, and `output` formats results. Go tests live beside
their packages as `*_test.go` files. The React/Vite workbench source is in
`web/src`; its built files are committed in `internal/workbench/dist` and
embedded by Go. `context.schema.json` is the checked-in context-file schema;
`bin/` contains ignored local binaries.

## Build, Test, and Development Commands

- `make build` builds `bin/efficient-daemon`.
- `make test` runs all Go tests; use `go test -run TestName ./...` for a focused test.
- `make vet` runs `go vet ./...`; `make fmt` applies `gofmt` to Go sources.
- `make build-web` runs `npm ci` and builds `web/` into the embedded `dist/` directory. Run it after changing the workbench.
- `make dev-web` starts Vite. Run `efficient-daemon serve --workbench` on `:8080` so the dev proxy can reach the API.
- `cd web && npm run lint` runs Oxlint. `make help` lists the available Make targets.

## Coding Style & Naming Conventions

Use `gofmt` and standard Go naming: lowercase package names, `PascalCase` exported
identifiers, and `camelCase` locals. Keep CLI wiring in `cmd/` and reusable
behavior in `internal/`. TypeScript/TSX follows the existing two-space,
double-quoted, semicolon-terminated style and uses the `@/` alias for `web/src`.

## Testing Guidelines

Use Go's standard `testing` package with `TestXxx` names and colocated
`*_test.go` files. Keep tests hermetic; existing end-to-end coverage uses
`httptest` rather than live APIs. No coverage threshold or frontend test
framework is configured, so add focused tests for behavior that warrants them.

## Commits and Pull Requests

Use short, imperative commit subjects matching history, such as `Add ...`,
`Fix ...`, or `Remove ...`. Pull requests should explain the behavior change,
link an issue when one exists, list checks run (`make test`, `make vet`, and
frontend lint/build as applicable), and include a screenshot for workbench UI
changes. Mention regenerated `internal/workbench/dist` files when relevant.

## Security & Configuration

Never commit API keys or `.env` files. Configure model access with CLI flags
such as `--api-key`, `--base-url`, and `--timeout`. PDF features require a
system `pdftoppm` or `mutool` binary; document that dependency when changing
PDF behavior.
