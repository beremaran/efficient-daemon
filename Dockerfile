FROM --platform=$BUILDPLATFORM golang:1.27-bookworm AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath \
    -ldflags "-s -w -X main.version=${VERSION}" \
    -o /out/efficient-daemon ./cmd/efficient-daemon

FROM debian:trixie-slim

ARG VERSION=dev
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=65532:65532 /out/efficient-daemon /usr/local/bin/efficient-daemon

LABEL org.opencontainers.image.source="https://github.com/beremaran/efficient-daemon" \
    org.opencontainers.image.version="${VERSION}"

ENV EFFICIENT_DAEMON_HOST=0.0.0.0 \
    EFFICIENT_DAEMON_WORKBENCH=true

USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/efficient-daemon"]
CMD ["serve"]
