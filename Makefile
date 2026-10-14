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
	cd apps/editor && flutter pub get && flutter analyze && flutter test

components:
	python3 tools/component_browser/scripts/demo_media.py
	cd tools/component_browser && flutter pub get && flutter build web --no-web-resources-cdn
	python3 -m http.server 8090 --bind 127.0.0.1 --directory tools/component_browser/build/web
