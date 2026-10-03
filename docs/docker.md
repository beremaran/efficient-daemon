# Docker

The image runs `efficient-daemon serve` with the workbench on, listening on port 8080. It includes Poppler for PDF input and runs as an unprivileged user.

## Run the published image

```sh
docker run -d --name efficient-daemon -p 127.0.0.1:8080:8080 \
  -e EFFICIENT_DAEMON_BASE_URL=https://api.example.com/v1 \
  -e EFFICIENT_DAEMON_MODEL=your-model-id \
  ghcr.io/beremaran/efficient-daemon:latest
```

The workbench is at `http://localhost:8080/`, and the API docs are at `http://localhost:8080/docs`. Base URL and model are optional; leave them unset to provide both with each `POST /ask` request. Set `EFFICIENT_DAEMON_API_KEY` only when the provider requires it.

The service has no authentication, so keep the published port bound to `127.0.0.1` unless something else guards it. See [HTTP API](api.md).

## Image tags

`ghcr.io/beremaran/efficient-daemon` is built for `linux/amd64` and `linux/arm64`.

| Tag | Points at |
| --- | --- |
| `latest` | the newest stable release |
| `1.2.3` | release `v1.2.3` |
| `1.2` | the newest `v1.2.x` release |
| `main` | the newest commit on `main` |
| `sha-abc1234` | one commit |

Each image carries an SBOM and a build provenance attestation.

## Compose

From a clone, copy `.env.example` to `.env`, set `EFFICIENT_DAEMON_BASE_URL` and `EFFICIENT_DAEMON_MODEL` if you want server-side request defaults, then start the service:

```sh
docker compose up --build -d
```

Stop it with `docker compose down`.

## Settings

Each `serve` flag also accepts a matching `EFFICIENT_DAEMON_` environment variable; explicit CLI flags take precedence. With Compose, set `EFFICIENT_DAEMON_PUBLISHED_PORT` to change the host port, while `EFFICIENT_DAEMON_PORT` changes the port inside the container.
