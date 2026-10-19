.PHONY: test components doctor

doctor:
	python3 scripts/doctor.py

test:
	python3 -m unittest discover -s tests -v
	node --test tools/dither/core.test.mjs
	cd components && flutter pub get && flutter analyze && flutter test
	cd examples/gallery && flutter pub get && flutter analyze && flutter test
	python3 tools/component_browser/scripts/demo_media.py
	cd tools/component_browser && flutter pub get && flutter analyze && flutter test
	python3 -m unittest discover -s apps/editor/tests -v
	node --test apps/editor/tests/model.test.mjs

components:
	python3 tools/component_browser/scripts/demo_media.py
	cd tools/component_browser && flutter pub get && flutter build web --no-web-resources-cdn
	python3 -m http.server 8090 --bind 127.0.0.1 --directory tools/component_browser/build/web

editor:
	python3 apps/editor/server.py

.PHONY: setup-dev hooks check-local
setup-dev:
	npm --prefix apps/review-agent ci
	npm --prefix docs ci
	python3 scripts/install-hooks.py

hooks:
	python3 scripts/install-hooks.py

# Routine checks run locally; Flutter checks remain available through make test.
check-local:
	python3 -m unittest discover -s tests -q
	python3 -m unittest discover -s apps/editor/tests -q
	node --test apps/editor/tests/model.test.mjs tools/dither/core.test.mjs
	npm --prefix apps/review-agent test
	npm --prefix docs run build
