# Compose

Author one Fluvie Video as a sequence of coherent scenes from the imported edit
timeline and storyboard/scenes.json. Each scene owns its retained source ranges,
footage placement, graphics, captions, sound and transitions. Keep source time,
scene-local time and whole-video output time explicit. Preserve narration across
scene boundaries without duplicated audio. Use components/CATALOG.md as needed.

Validate the composition, then open its live Fluvie preview using
`.skills/edit-video/references/compose.md`. Review scene timing and joins, refine
those same scenes, and reload. Render the assembled Video after an explicit export
request or approval. Do not encode a full video first and add graphics afterward.
Short excerpts, per-clip proxies and audio preparation are allowed when needed.

`video.py compose projects/<slug>` currently creates a legacy one-scene baseline
using a rendered rough cut. That generator has not been converted to scene-based
authoring: do not run it as a prerequisite for this workflow. Author the scene
sequence directly using the installed Fluvie API. Existing main.dart is protected
from accidental regeneration. Preview and export share the authored composition.

Commands run from the toolkit root; `video.py` means `python3 scripts/video.py`.
