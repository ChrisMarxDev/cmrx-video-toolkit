---
title: Video workflow
description: How to edit a recording, plan animations and render the result.
---

Start with `.skills/edit-video/SKILL.md`. Load the creative direction from your own
workspace. Invoke `$edit-video`; it loads only the stage reference needed.

| Stage | Outcome | Guidance |
| --- | --- | --- |
| Ingest | Preserved source and inspected media | `edit-video/references/ingest.md` |
| Transcribe | Transcript with timestamps from the recording | `edit-video/references/transcribe.md` |
| Edit | Approved cuts and a map between source and edited timestamps | `edit-video/references/edit.md` |
| Storyboard | Visuals tied to the edited narration | `edit-video/references/storyboard.md` |
| Compose | Flutter code for the video | `edit-video/references/compose.md` |
| Review | Specific feedback and targeted revisions | `video-review` |
| Render | A final video checked for picture, sound and timing | `edit-video/references/render.md` |

## Match animations to the edited video

The transcript refers to the source recording. After cuts, animation belongs to
edited-output time. Use the timeline produced by `scripts/video.py import-edit`
to calculate when each visual should appear. A timestamp from the original
recording will be wrong if earlier footage has been cut.

Read the [artifact contracts](/cmrx-video-toolkit/reference/contracts/) for the
handoff structure. Use `python3 scripts/video.py --help` to inspect commands and
read the matching stage reference before execution.

## Build scenes, then render

Divide retained footage into coherent Fluvie scenes. Construct footage, graphics,
captions and sound together in those scenes, then assemble one editable Video.
Review take selection, rough-cut timing and scene joins in live Fluvie, and refine
visuals in that same composition. Render the complete composition after an export
request or approval. A full flattened cut video is not the starting point for graphics.

Preserve source media and scene-to-source mappings. Reuse approved timing during
visual changes and keep one coherent narration stream across scenes. Per-clip
proxies, short diagnostic excerpts and audio preparation remain available; repeated
full-video renders are not the editing loop. Run `prepare-clips` after importing
the edit to prepare reusable footage with stable IDs and source/output metadata.
The `compose` generator scaffolds one scene per clip. Change named source ranges
with `adjust-clip`, prepare again, and reconcile authored cues; unchanged footage
files are reused. See the pipeline contracts for command details and cache limits.

## Shaders and 3D scenes

The skill catalog includes component authoring, video shaders, dithering and
Flutter Scene. GPU Scene capture uses a separate native macOS path; headless Fluvie exports do not provide that integration. Start with each capability's skill and
validate its output in your target environment.

## Focused skills

- **video-style** — Define or revise a reusable visual identity.
- **video-review** — Collect human feedback through the review editor.
- **component-select** — Find and configure existing components.
- **component-author** — Create graphics and register reusable components.
- **component-shaders** — Author and integrate deterministic shaders.
- **component-3d** — Capture native Flutter Scene geometry.
- **component-dithering** — Implement deterministic component dither textures.
- **effect-background-remove** — Create person cutouts from existing footage.
- **effect-behind-subject** — Place editable content between a source clip and its person cutout.
- **fluvie-compose** — Author framework-specific Fluvie compositions.
- **fluvie-render** — Preview, export and diagnose Fluvie rendering.
- **fluvie-generative-ai** — Generate media or prompt-authored compositions.
