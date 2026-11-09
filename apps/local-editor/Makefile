WORKSPACE ?= workspaces/demo
PORT ?= 4319
SOURCE ?=
.PHONY: install build demo run check browser-check import
# Install pinned packages: make install
install:
	npm ci
# Compile server and browser: make build
build:
	npm run build
# Generate synthetic media in a NEW workspace: make demo WORKSPACE=workspaces/try-2
demo:
	npm run demo -- --workspace "$(WORKSPACE)"
# Start the local service: make run WORKSPACE=workspaces/demo PORT=4319
run: build
	npm start -- --workspace "$(WORKSPACE)" --port "$(PORT)"
# Typecheck and run isolated state/media tests: make check
check:
	npm run typecheck
	npm test
# Optional browser acceptance: make browser-check EDITOR_PLAYWRIGHT=/path/to/playwright
browser-check: build
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" npm run test:browser
# Import a proxy into the running workspace: make import SOURCE=/path/video.mp4
import:
	npm run import -- --workspace "$(WORKSPACE)" --source "$(SOURCE)"

.PHONY: context
# Inspect agent context without editing: make context WORKSPACE=workspaces/demo
context:
	npm run agent -- context --workspace "$(WORKSPACE)"

.PHONY: format
# Format application and extension source: make format
format:
	npm run format

.PHONY: mcp
# MCP Apps stdio adapter for a running workspace: make mcp WORKSPACE=workspaces/demo
mcp:
	@node scripts/mcp.mjs --workspace "$(WORKSPACE)"
