TOOLKIT ?= $(abspath ../../../../..)
.PHONY: preflight check notarize
# Read-only readiness report, exit 2 for blockers: make preflight TOOLKIT=/path/to/toolkit
preflight:
	node scripts/preflight.mjs --repo "$(TOOLKIT)"
# Verify diagnostics and non-Mac refusal without signing/uploading: make check
check:
	node --test scripts/preflight.test.mjs
	python3 -m unittest discover -s scripts -p "*_test.py"
	bash -n scripts/verify-macos.sh

# Submit once/check once/staple accepted artifact: make notarize NOTARY_ARTIFACT=/path/app.zip NOTARY_TARGET=/path/App.app NOTARY_STATE=/cache/app.json CMRX_NOTARY_PROFILE=saved-profile
notarize:
	python3 scripts/notarize.py --artifact "$(NOTARY_ARTIFACT)" --target "$(NOTARY_TARGET)" --state "$(NOTARY_STATE)" $(if $(CMRX_NOTARY_PROFILE),--profile "$(CMRX_NOTARY_PROFILE)",) $(if $(NOTARY_ID),--submission-id "$(NOTARY_ID)",); result=$$?; if [ $$result -eq 3 ]; then echo "Apple review is pending; rerun this same command later."; exit 0; fi; exit $$result

.PHONY: configure
# Save existing credentials locally: make configure [CONFIG_DIALOG=1]
configure:
	python3 scripts/configure.py $(if $(CONFIG_DIALOG),--dialog,)
