---
title: Video workflow
description: A reviewed, stage-by-stage process from source recording to rendered video.
---

Start with `.skills/video-flow/SKILL.md`. Load the creative direction from your own
workspace, then use the skill for the stage you are working on.

| Stage | Outcome | Skill |
| --- | --- | --- |
| Ingest | Preserved source and inspected media | `video-ingest` |
| Transcribe | Source-timed transcript | `video-transcribe` |
| Edit | Reviewed cuts and explicit timeline mapping | `video-edit` |
| Storyboard | Visuals tied to the edited narration | `video-storyboard` |
| Compose | A reproducible, code-based composition | `video-compose` |
| Review | Specific feedback and targeted revisions | `video-review` |
| Render | An inspected final output | `video-render` |

## Keep two clocks separate

The transcript refers to the source recording. After cuts, animation belongs to
edited-output time. Use the timeline produced by `scripts/video.py import-edit`
to resolve cues; never guess timestamps or shift them by intuition.

Read the [artifact contracts](/cmrx-video-toolkit/reference/contracts/) for the
handoff structure. Use `python3 scripts/video.py --help` to inspect commands and
read the matching skill before running a stage.

## Review before decorating

Approve the take selection and rough cut before building detailed animation.
For revisions, reuse valid artifacts: changing a color does not require a new
transcript. Keep one narration stream and preserve original media.

## Extra capabilities

The skill catalog includes component authoring, video shaders, dithering and
Flutter Scene. GPU Scene capture uses a separate native macOS path; do not assume
it works inside headless Fluvie exports. Start with each capability's skill and
validate its output in your target environment.
