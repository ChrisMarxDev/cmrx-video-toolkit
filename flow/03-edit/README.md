# Edit

Review the transcript and record source-timed decisions using `docs/contracts.md`.
Run `video.py import-edit` to produce the authoritative source-to-output timeline.
The importer keeps contiguous word runs and trims leading/trailing silence;
overlapping word timings require manual repair. Preserve complete speech endings
and audition uncertain joins with source handles.

Use the retained ranges to construct Fluvie scenes directly from original media.
Review rough-cut timing in that live composition, then refine graphics, captions
and sound in the same scenes. Keep source-timed notes in `annotations.json`.
A full flattened rough-cut MP4 is not a prerequisite for composition.

`video.py cut` remains available for explicitly requested encoded cuts or targeted
diagnostics. It produces `composition/assets/rough-cut.mp4` and
`edit/narration.wav`; these are legacy/export artifacts, not the default scene
handoff. Per-clip proxies and required audio preparation remain allowed.
