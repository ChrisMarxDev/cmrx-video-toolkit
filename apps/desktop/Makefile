WORKSPACE ?=
.PHONY: build run check
# Build the existing JS editor: make build
build:
	npm --prefix ../local-editor run build
# Open Linux desktop app: make run [WORKSPACE=/absolute/project]
run: build
	./scripts/run.sh $(if $(WORKSPACE),--workspace "$(WORKSPACE)",)
# Verify chat/tool/editor integration: make check
check: build
	npm test

.PHONY: install-launcher
# Add a user-level launcher for this checkout: make install-launcher
install-launcher: build
	python3 scripts/install-launcher.py

.PHONY: browser-check
# Exercise native project tabs and lifecycle. Usage: make browser-check EDITOR_PLAYWRIGHT=/path/to/playwright
browser-check: build
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_ELECTRON="$(EDITOR_ELECTRON)" node tests/workspace-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_ELECTRON="$(EDITOR_ELECTRON)" node tests/project-tabs-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_ELECTRON="$(EDITOR_ELECTRON)" CHAT_TEST_VIDEO="$(CHAT_TEST_VIDEO)" node tests/stepper-browser.mjs

.PHONY: deps agent-browser-check
# Install the desktop app's locked dependencies: make deps
deps:
	npm ci --ignore-scripts
# Verify connections, keys, skills, confirmations and in-app tools: make agent-browser-check [EDITOR_PLAYWRIGHT=/path/to/playwright]
agent-browser-check: build
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/runtime-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/timeline-import-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/preview-controls-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/image-paste-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/markdown-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" EDITOR_RESULTS="$(EDITOR_RESULTS)" node tests/project-agent-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" EDITOR_RESULTS="$(EDITOR_RESULTS)" node tests/asset-library-browser.mjs
