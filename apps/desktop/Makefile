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
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/audio-gain-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/preview-quality-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/image-paste-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/markdown-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" EDITOR_RESULTS="$(EDITOR_RESULTS)" node tests/project-agent-browser.mjs
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" EDITOR_RESULTS="$(EDITOR_RESULTS)" node tests/asset-library-browser.mjs

.PHONY: package-linux
# Build a Debian/Ubuntu amd64 installer outside the repo: make package-linux PACKAGE_DIR=/absolute/output FLUTTER_SDK=/absolute/sdk PUB_CACHE_DIR=/absolute/cache
package-linux:
	python3 scripts/package-linux.py --output "$(PACKAGE_DIR)" --sdk "$(FLUTTER_SDK)" --pub-cache "$(PUB_CACHE_DIR)"

.PHONY: verify-linux-package
# Exercise the unpacked candidate with bundled Electron/SDK and fresh HOME: make verify-linux-package LINUX_APP_DIR=/path/to/app PACKAGE_TEST_DIR=/new/output
verify-linux-package:
	node scripts/verify-linux.mjs --app "$(LINUX_APP_DIR)" --output "$(PACKAGE_TEST_DIR)"

.PHONY: range-browser-check
# Verify timeline selection, ripple edits and context menu: make range-browser-check EDITOR_PLAYWRIGHT=/path/to/playwright
range-browser-check: build
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/range-browser.mjs

.PHONY: design-browser-check
# Check setup progress, matrix loaders and first chat: make design-browser-check EDITOR_PLAYWRIGHT=/path/to/playwright
design-browser-check: build
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/design-browser.mjs

.PHONY: secondary-browser-check
# Review settings and asset loading/recovery: make secondary-browser-check EDITOR_PLAYWRIGHT=/path/to/playwright
secondary-browser-check: build
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/secondary-browser.mjs

.PHONY: recording-browser-check
# Verify native recorder with synthetic media (no desktop/camera capture): make recording-browser-check EDITOR_PLAYWRIGHT=/path/to/playwright EDITOR_ELECTRON=/path/to/electron
recording-browser-check: build
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_ELECTRON="$(EDITOR_ELECTRON)" node tests/recording-browser.mjs
.PHONY: macos-media macos-sdk package-macos sign-macos verify-macos-package macos-ui-check
.PHONY: macos-icon
# Rebuild the Mac app icon: make macos-icon [ICON_SOURCE=/path/icon.png ICON_OUTPUT=/path/icon.icns]
macos-icon:
	node scripts/build-macos-icon.mjs $(if $(ICON_SOURCE),--source "$(ICON_SOURCE)",) $(if $(ICON_OUTPUT),--output "$(ICON_OUTPUT)",)
# Build pinned static media tools and their corresponding source: make macos-media MEDIA_BUILD_DIR=/new/output
macos-media:
	python3 scripts/build-macos-media.py --output "$(MEDIA_BUILD_DIR)"
# Prepare the pinned Flutter test runtime: make macos-sdk FLUTTER_SDK=/builder/sdk PUB_CACHE_DIR=/builder/cache
macos-sdk:
	python3 scripts/prepare-macos-sdk.py --sdk "$(FLUTTER_SDK)" --pub-cache "$(PUB_CACHE_DIR)"
# Package a committed Apple Silicon app: make package-macos PACKAGE_DIR=/new/output FLUTTER_SDK=/sdk PUB_CACHE_DIR=/cache MEDIA_BIN=/media/prefix/bin
package-macos:
	node scripts/package-macos.mjs --output "$(PACKAGE_DIR)" --sdk "$(FLUTTER_SDK)" --pub-cache "$(PUB_CACHE_DIR)" --media-bin "$(MEDIA_BIN)" $(if $(DEVELOPMENT),--development,)
# Sign nested native code with Developer ID: make sign-macos MAC_APP=/path/App.app CMRX_SIGN_IDENTITY='Developer ID Application: …'
sign-macos:
	CMRX_SIGN_IDENTITY="$(CMRX_SIGN_IDENTITY)" node scripts/sign-macos.mjs "$(MAC_APP)"
# Render newly authored graphics with a fresh profile, bundled tools and no Xcode: make verify-macos-package MAC_APP=/path/App.app PACKAGE_TEST_DIR=/new/output
verify-macos-package:
	node scripts/verify-macos.mjs --app "$(MAC_APP)" --output "$(PACKAGE_TEST_DIR)"
# Test packaged native onboarding, import and custom skills with a fixture account: make macos-ui-check MAC_APP=/path/App.app EDITOR_PLAYWRIGHT=/path/to/playwright
macos-ui-check:
	EDITOR_PACKAGED_APP="$(MAC_APP)" EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" node tests/stepper-browser.mjs

.PHONY: audio-browser-check
# Verify live audio gain, mute and unmute: make audio-browser-check EDITOR_PLAYWRIGHT=/path/to/playwright
audio-browser-check: build
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/audio-gain-browser.mjs

.PHONY: macos-dmg
# Build the branded installer from a signed/stapled app: make macos-dmg MAC_APP=/path/App.app MAC_DMG=/new/output.dmg
macos-dmg:
	python3 scripts/package-macos-dmg.py --app "$(MAC_APP)" --output "$(MAC_DMG)"

.PHONY: preview-quality-check
# Verify cached preview qualities, timing, alpha and export isolation: make preview-quality-check EDITOR_PLAYWRIGHT=/path/to/playwright
preview-quality-check: build
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/preview-quality-browser.mjs

.PHONY: graphics-layout-check
# Render arbitrary root Positioned graphics with the installed toolkit: make graphics-layout-check [CHAT_WORKER_ROOT=/existing/worker]
graphics-layout-check: build
	node tests/graphics-layout-render.mjs

.PHONY: toolkit-browser-check
# Shared toolkit project UX: make toolkit-browser-check EDITOR_PLAYWRIGHT=/path/to/playwright/index.mjs
toolkit-browser-check: build
	EDITOR_PLAYWRIGHT="$(EDITOR_PLAYWRIGHT)" EDITOR_CHROMIUM="$(EDITOR_CHROMIUM)" node tests/toolkit-environment-browser.mjs

.PHONY: toolkit-render-check
# Real source+Flutter acceptance; usage: make toolkit-render-check EDITOR_SOURCE_PROJECT=/path/to/imported/project
toolkit-render-check: build
	EDITOR_SOURCE_PROJECT="$(EDITOR_SOURCE_PROJECT)" node tests/toolkit-environment-render.mjs
