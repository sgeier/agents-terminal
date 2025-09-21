SHELL := /bin/bash

.PHONY: setup setup-server setup-client run run-server run-client build test lint clean

setup: setup-server setup-client ## Install deps
	@echo "Setup complete"

setup-server:
	cd app/server && npm ci || (cd app/server && npm install)

setup-client:
	cd app/client && npm ci || (cd app/client && npm install)

run: ## Run server only
	$(MAKE) run-server

run-ui: ## Run client only
	cd app/client && npm run dev

run-both: ## Run server and client (two processes)
	@echo "Starting server and client in two terminals..."
	@echo "Run in separate shells: make run-server | make run-ui"

run-server:
	cd app/server && npm run dev

build:
	cd app/server && npm run build
	cd app/client && npm run build

test:
	@echo "No tests yet. Add tests under tests/."

lint:
	@echo "No linter configured yet."

clean:
	rm -rf app/server/node_modules app/server/dist app/client/node_modules app/client/dist
