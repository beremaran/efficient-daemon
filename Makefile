BIN := bin/efficient-daemon
WEB_DIR := web

.PHONY: build test test-web fmt vet clean help build-web dev-web licenses

build:            ## Build the CLI into ./bin/efficient-daemon
	@mkdir -p bin
	go build -o $(BIN) ./cmd/efficient-daemon

build-web:        ## Build the workbench UI into internal/workbench/dist (committed; needs node/npm)
	cd $(WEB_DIR) && npm ci && npm run build

licenses:         ## Refresh third-party license notices for the Go binary and workbench
	rm -rf THIRD_PARTY_LICENSES/go THIRD_PARTY_LICENSES/web THIRD_PARTY_NOTICES.md
	mkdir -p THIRD_PARTY_LICENSES
	python3 scripts/check-go-licenses.py
	go run github.com/google/go-licenses@v1.6.0 save ./cmd/efficient-daemon --save_path=THIRD_PARTY_LICENSES/go
	cd $(WEB_DIR) && npx --yes license-checker-rseidelsohn@5.0.1 --production --excludePrivatePackages --onlyAllow '0BSD;Apache-2.0;BSD-3-Clause;ISC;MIT' --files ../THIRD_PARTY_LICENSES/web --markdown --out ../THIRD_PARTY_NOTICES.md

dev-web:          ## Run the workbench UI dev server (proxies /ask, /config, /schema/lint to :8080)
	cd $(WEB_DIR) && npm run dev

test:             ## Run all Go tests
	go test ./...

test-web:         ## Run the workbench tests (needs node/npm)
	cd $(WEB_DIR) && npm test

fmt:              ## Format all source files
	gofmt -w cmd internal

vet:              ## Run go vet
	go vet ./...

clean:            ## Remove build artifacts
	rm -rf bin

help:             ## Show this help
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-8s %s\n", $$1, $$2}'
