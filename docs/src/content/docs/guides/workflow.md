---
title: Video workflow
description: How to edit a recording, plan animations and render the result.
---

Start with `.skills/video-flow/SKILL.md`. Load the creative direction from your own
workspace, then use the skill for the stage you are working on.

| Stage | Outcome | Skill |
| --- | --- | --- |
| Ingest | Preserved source and inspected media | `video-ingest` |
| Transcribe | Transcript with timestamps from the recording | `video-transcribe` |
| Edit | Approved cuts and a map between source and edited timestamps | `video-edit` |
| Storyboard | Visuals tied to the edited narration | `video-storyboard` |
| Compose | Flutter code for the video | `video-compose` |
| Review | Specific feedback and targeted revisions | `video-review` |
| Render | A final video checked for picture, sound and timing | `video-render` |

## Match animations to the edited video

The transcript refers to the source recording. After cuts, animation belongs to
edited-output time. Use the timeline produced by `scripts/video.py import-edit`
to calculate when each visual should appear. A timestamp from the original
recording will be wrong if earlier footage has been cut.

Read the [artifact contracts](/cmrx-video-toolkit/reference/contracts/) for the
handoff structure. Use `python3 scripts/video.py --help` to inspect commands and
read the matching skill before running a stage.

## Approve cuts before adding animation

Approve the take selection and rough cut before building detailed animation.
Reuse the approved cut and transcript when changing colors or animation. Keep one narration stream and preserve original media.

## Shaders and 3D scenes

The skill catalog includes component authoring, video shaders, dithering and
Flutter Scene. GPU Scene capture uses a separate native macOS path; headless Fluvie exports do not provide that integration. Start with each capability's skill and
validate its output in your target environment.
