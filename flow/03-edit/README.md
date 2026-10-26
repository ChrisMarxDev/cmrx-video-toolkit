# Edit

Review the transcript and record source-timed decisions using `docs/contracts.md`.
Run `video.py import-edit` to produce the authoritative source-to-output timeline.
The importer keeps contiguous word runs and trims leading/trailing silence;
overlapping word timings require manual repair. Preserve complete speech endings
and audition uncertain joins with source handles.

Run `video.py prepare-clips` after import to prepare reusable footage files with
stable IDs and source/output ranges in `edit/clips.json`. Use `video.py adjust-clip
<project> <clip_id> --start <source-seconds> --end <source-seconds>` to change a
boundary, then prepare again; unchanged clips are reused. See docs/contracts.md
for identity, timing and cache limits. Use those clips to construct Fluvie scenes.
Review rough-cut timing in that live composition, then refine graphics, captions
and sound in the same scenes. Keep source-timed notes in `annotations.json`.
A full flattened rough-cut MP4 is not a prerequisite for composition.

`video.py cut` remains available for explicitly requested encoded cuts or targeted
diagnostics. It produces `composition/assets/rough-cut.mp4` and
`edit/narration.wav`; these are legacy/export artifacts, not the default scene
handoff. Per-clip proxies and required audio preparation remain allowed.

For optional pixel-change evidence during source review, follow the
[edit-stage guidance](../../.skills/edit-video/references/edit.md#optional-visual-evidence-before-cut-decisions)
and [visual-map tool](../../tools/visual_map/README.md). It helps inspect movement
and held changes, with reference selection and review-coverage checks. Candidate
windows locate original passages; they are not edit decisions or automatic cuts.
