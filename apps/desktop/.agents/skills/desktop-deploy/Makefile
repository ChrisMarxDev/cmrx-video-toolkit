TOOLKIT ?= $(abspath ../../../../..)
.PHONY: preflight check
# Read-only readiness report, exit 2 for blockers: make preflight TOOLKIT=/path/to/toolkit
preflight:
	node scripts/preflight.mjs --repo "$(TOOLKIT)"
# Verify diagnostics and non-Mac refusal without signing/uploading: make check
check:
	node --test scripts/preflight.test.mjs
	bash -n scripts/verify-macos.sh
