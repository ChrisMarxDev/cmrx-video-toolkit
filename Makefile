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

.PHONY: foreground-sandwich-test foreground-sandwich-inspect
# Check the optional foreground sandwich helper: make foreground-sandwich-test
foreground-sandwich-test:
	python3 -m unittest discover -s .skills/effect-behind-subject/tests -v

# Check editable layer inputs. Usage: make foreground-sandwich-inspect BASE=/clip.mp4 CUTOUT=/foreground.mov
foreground-sandwich-inspect:
	$(if $(strip $(BASE)),,$(error BASE is required))
	$(if $(strip $(CUTOUT)),,$(error CUTOUT is required))
	python3 .skills/effect-behind-subject/scripts/foreground_sandwich.py inspect --base "$(BASE)" --cutout "$(CUTOUT)"

.PHONY: video-link-source video-unlink-source video-prepare-clips video-compose linked-sources-test
# Link a recording: make video-link-source PROJECT=/video ID=screen SOURCE=/screen.mp4 OFFSET=0.5
video-link-source:
	$(if $(strip $(PROJECT)),,$(error PROJECT is required))
	$(if $(strip $(ID)),,$(error ID is required))
	$(if $(strip $(SOURCE)),,$(error SOURCE is required))
	python3 scripts/video.py link-source "$(PROJECT)" "$(ID)" --source "$(SOURCE)" --offset "$(or $(OFFSET),0)"

# Remove a companion: make video-unlink-source PROJECT=/video ID=screen
video-unlink-source:
	$(if $(strip $(PROJECT)),,$(error PROJECT is required))
	$(if $(strip $(ID)),,$(error ID is required))
	python3 scripts/video.py link-source "$(PROJECT)" "$(ID)" --remove

# Prepare all synchronized excerpts: make video-prepare-clips PROJECT=/video
video-prepare-clips:
	$(if $(strip $(PROJECT)),,$(error PROJECT is required))
	python3 scripts/video.py prepare-clips "$(PROJECT)"

# Scaffold without replacing authored scenes: make video-compose PROJECT=/video COMPANION=screen
video-compose:
	$(if $(strip $(PROJECT)),,$(error PROJECT is required))
	python3 scripts/video.py compose "$(PROJECT)" $(if $(COMPANION),--companion "$(COMPANION)")

# Synthetic linked-source media regression: make linked-sources-test
linked-sources-test:
	python3 -m unittest discover -s tests -p 'test_linked_sources.py' -v

.PHONY: speech-models align-speech map-speech check-cuts measure-media targeted-preview media-evidence-test speech-model-test
EVIDENCE_PYTHON ?= python3
# Explicit optional model setup. Usage: make speech-models MODELS=/outside/git/models
speech-models:
	$(if $(strip $(MODELS)),,$(error MODELS is required))
	$(EVIDENCE_PYTHON) -m tools.media_evidence.setup_models --models "$(MODELS)"

# Measure words/VAD; use the optional environment. Usage: make align-speech SOURCE=/video.mp4 TRANSCRIPT=/segments.json MODELS=/models OUTPUT=/new/evidence LANGUAGE=en EVIDENCE_PYTHON=/venv/bin/python
align-speech:
	$(if $(strip $(SOURCE)),,$(error SOURCE is required))
	$(if $(strip $(TRANSCRIPT)),,$(error TRANSCRIPT is required))
	$(if $(strip $(MODELS)),,$(error MODELS is required))
	$(if $(strip $(OUTPUT)),,$(error OUTPUT is required))
	$(if $(strip $(LANGUAGE)),,$(error LANGUAGE is required))
	$(EVIDENCE_PYTHON) -m tools.media_evidence.speech --source "$(SOURCE)" --transcript "$(TRANSCRIPT)" --models "$(MODELS)" --output "$(OUTPUT)" --language "$(LANGUAGE)"

# Map measured words, excluding uncertain/partial cues. Usage: make map-speech SOURCE=/video.mp4 SPEECH=/speech.json TIMELINE=/edit/timeline.json OUTPUT=/new/words
map-speech:
	$(if $(strip $(SOURCE)),,$(error SOURCE is required))
	$(if $(strip $(SPEECH)),,$(error SPEECH is required))
	$(if $(strip $(TIMELINE)),,$(error TIMELINE is required))
	$(if $(strip $(OUTPUT)),,$(error OUTPUT is required))
	python3 -m tools.media_evidence.map_words --source "$(SOURCE)" --speech "$(SPEECH)" --timeline "$(TIMELINE)" --output "$(OUTPUT)"

# Inspect joins; optional speech and excerpts. Usage: make check-cuts SOURCE=/video.mp4 TIMELINE=/edit/timeline.json OUTPUT=/new/check SPEECH=/speech.json EXCERPTS=1
check-cuts:
	$(if $(strip $(SOURCE)),,$(error SOURCE is required))
	$(if $(strip $(TIMELINE)),,$(error TIMELINE is required))
	$(if $(strip $(OUTPUT)),,$(error OUTPUT is required))
	python3 -m tools.media_evidence.quality cuts --source "$(SOURCE)" --timeline "$(TIMELINE)" --output "$(OUTPUT)" $(if $(SPEECH),--speech "$(SPEECH)") $(if $(filter 1,$(EXCERPTS)),--excerpts)

# Independent export measurements. Usage: make measure-media MEDIA=/draft.mp4 OUTPUT=/new/measurements
measure-media:
	$(if $(strip $(MEDIA)),,$(error MEDIA is required))
	$(if $(strip $(OUTPUT)),,$(error OUTPUT is required))
	python3 -m tools.media_evidence.quality media --media "$(MEDIA)" --output "$(OUTPUT)"

# Select an output range, clip ID or 1-based cut. Usage: make targeted-preview SOURCE=/video.mp4 TIMELINE=/edit/timeline.json OUTPUT=/new/preview CUT=1
# Composed mode adds RENDER=/renders/draft.mp4 RECEIPT=/renders/draft.receipt.json COMPOSITION=/composition
# Alternatives: RANGE=2:4 or CLIP=intro. Repeat selections through the Python CLI.
targeted-preview:
	$(if $(strip $(SOURCE)),,$(error SOURCE is required))
	$(if $(strip $(TIMELINE)),,$(error TIMELINE is required))
	$(if $(strip $(OUTPUT)),,$(error OUTPUT is required))
	python3 -m tools.media_evidence.previews --source "$(SOURCE)" --timeline "$(TIMELINE)" --output "$(OUTPUT)" $(if $(CUT),--cut-index "$(CUT)") $(if $(CLIP),--clip-id "$(CLIP)") $(if $(RANGE),--range "$(RANGE)") $(if $(RENDER),--render "$(RENDER)") $(if $(RECEIPT),--receipt "$(RECEIPT)") $(if $(COMPOSITION),--composition "$(COMPOSITION)")

# Core synthetic tests without models. Usage: make media-evidence-test
media-evidence-test:
	python3 -m unittest discover -s tests -p 'test_media_evidence.py' -v

# Opt-in actual CPU alignment/VAD acceptance. Usage: make speech-model-test MODELS=/models EVIDENCE_PYTHON=/venv/bin/python
speech-model-test:
	$(if $(strip $(MODELS)),,$(error MODELS is required))
	EVIDENCE_MODELS="$(MODELS)" $(EVIDENCE_PYTHON) -m unittest discover -s tests -p 'test_media_evidence.py' -v
