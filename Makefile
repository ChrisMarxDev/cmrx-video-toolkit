.PHONY: test components doctor

doctor:
	python3 scripts/doctor.py

test:
	cd tools/previewer/flutter && flutter pub get && flutter analyze && flutter test
	python3 -m unittest discover -s tests -v
	node --test tools/dither/core.test.mjs tools/previewer/*.test.mjs
	cd components && flutter pub get && flutter analyze && flutter test
	cd examples/gallery && flutter pub get && flutter analyze && flutter test
	python3 tools/component_browser/scripts/demo_media.py
	cd tools/component_browser && flutter pub get && flutter analyze && flutter test
	python3 -m unittest discover -s apps/editor/tests -v
	node --test apps/editor/tests/*.test.mjs

components:
	python3 tools/component_browser/scripts/demo_media.py
	cd tools/component_browser && flutter pub get && flutter build web --no-web-resources-cdn
	python3 -m http.server 8090 --bind 127.0.0.1 --directory tools/component_browser/build/web

editor:
	python3 apps/editor/server.py

.PHONY: setup-dev hooks check-local
setup-dev:
	npm --prefix tools/fal ci
	npm --prefix apps/review-agent ci
	npm --prefix apps/component-browser-agent ci
	npm --prefix docs ci
	python3 scripts/install-hooks.py

hooks:
	python3 scripts/install-hooks.py

# Routine checks run locally; Flutter checks remain available through make test.
check-local:
	npm --prefix tools/fal test
	python3 -m unittest discover -s tests -q
	python3 -m unittest discover -s apps/editor/tests -q
	node --test apps/editor/tests/*.test.mjs tools/dither/core.test.mjs tools/previewer/*.test.mjs
	npm --prefix apps/review-agent test
	npm --prefix apps/component-browser-agent test
	npm --prefix docs run build

.PHONY: visual-map visual-map-test
# Analyze pixel changes in isolation; OUTPUT must be new and outside Git.
# Usage: make visual-map VIDEO="/path/to/video.mp4" OUTPUT="/path/to/new/analysis"
visual-map:
	$(if $(strip $(VIDEO)),,$(error VIDEO is required))
	$(if $(strip $(OUTPUT)),,$(error OUTPUT is required))
	python3 tools/visual_map/visual_map.py "$(VIDEO)" --output "$(OUTPUT)"

# Run synthetic visual-map checks: make visual-map-test
visual-map-test:
	python3 -m unittest discover -s tools/visual_map -v

.PHONY: meshy-scene-test meshy-scene-inspect meshy-scene-scaffold meshy-scene-encode
# Check the optional skill without network or credits. Usage: make meshy-scene-test
meshy-scene-test:
	python3 -m unittest discover -s .skills/meshy-scene/tests -v

# Inspect a local GLB. Usage: make meshy-scene-inspect MODEL=/absolute/model.glb
meshy-scene-inspect:
	$(if $(strip $(MODEL)),,$(error MODEL is required))
	python3 .skills/meshy-scene/scripts/scene_capture.py inspect "$(MODEL)"

# Create an isolated capture app. Usage: make meshy-scene-scaffold MODEL=/assets/model.glb OUTPUT=/tmp/capture-app PLATFORM=linux
meshy-scene-scaffold:
	$(if $(strip $(MODEL)),,$(error MODEL is required))
	$(if $(strip $(OUTPUT)),,$(error OUTPUT is required))
	python3 .skills/meshy-scene/scripts/scene_capture.py scaffold --model "$(MODEL)" --output "$(OUTPUT)" --platform "$(or $(PLATFORM),macos)"

# Encode completed frames with alpha. Usage: make meshy-scene-encode FRAMES=/tmp/frames OUTPUT=/tmp/model.mov
meshy-scene-encode:
	$(if $(strip $(FRAMES)),,$(error FRAMES is required))
	$(if $(strip $(OUTPUT)),,$(error OUTPUT is required))
	python3 .skills/meshy-scene/scripts/scene_capture.py encode --frames "$(FRAMES)" --output "$(OUTPUT)"
