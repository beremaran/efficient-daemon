BIN := bin/efficient-daemon

.PHONY: build test fmt vet clean help

build:            ## Build the CLI into ./bin/efficient-daemon
	@mkdir -p bin
	go build -o $(BIN) ./cmd/efficient-daemon

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
