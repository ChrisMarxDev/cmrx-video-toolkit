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

## Approve cuts before adding animation

Approve the take selection and rough cut before building detailed animation.
Reuse the approved cut and transcript when changing colors or animation. Keep one narration stream and preserve original media.

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
- **fluvie-compose** — Author framework-specific Fluvie compositions.
- **fluvie-render** — Preview, export and diagnose Fluvie rendering.
- **fluvie-generative-ai** — Generate media or prompt-authored compositions.
