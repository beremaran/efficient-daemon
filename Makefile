BIN := bin/efficient-daemon
WEB_DIR := web

.PHONY: build test fmt vet clean help build-web dev-web

build:            ## Build the CLI into ./bin/efficient-daemon
	@mkdir -p bin
	go build -o $(BIN) ./cmd/efficient-daemon

build-web:        ## Build the workbench UI into internal/workbench/dist (committed; needs node/npm)
	cd $(WEB_DIR) && npm ci && npm run build

dev-web:          ## Run the workbench UI dev server (proxies /ask, /config, /schema/lint to :8080)
	cd $(WEB_DIR) && npm run dev

test:             ## Run all tests
	go test ./...

fmt:              ## Format all source files
	gofmt -w cmd internal

vet:              ## Run go vet
	go vet ./...

clean:            ## Remove build artifacts
	rm -rf bin

help:             ## Show this help
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-8s %s\n", $$1, $$2}'
