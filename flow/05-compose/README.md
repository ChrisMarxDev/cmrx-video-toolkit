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

`video.py prepare-clips projects/<slug>` prepares each retained source range and
generates `source_clips.dart` with stable IDs, asset paths and source/output times.
`video.py compose projects/<slug>` creates one scene per prepared clip. Author
graphics in main.dart or other authored files; generated clip data is disposable.
Use `sourceClip('intro')` to address a named clip. After boundary edits prepare
again, reconcile the authored scenes/cues, and update their timeline manifest.
Existing main.dart is protected from accidental regeneration. The explicit
`--legacy-rough-cut` flag retains old flattened scaffolding. Preview and export
share the authored composition; the default path needs no full cut MP4.

Commands run from the toolkit root; `video.py` means `python3 scripts/video.py`.
