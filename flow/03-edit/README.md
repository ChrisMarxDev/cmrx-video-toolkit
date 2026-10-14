# Edit

Review the transcript with the user and record deleted word indices in edit JSON
(see `docs/contracts.md`). Run `video.py import-edit`, then `cut`. The importer
keeps contiguous word runs and trims leading/trailing silence. It rejects
overlapping word timings for manual repair. Listen to joins; no unreviewed padding
or crossfades are added.

Keep source-timed animation notes in `annotations.json`.

`composition/assets/rough-cut.mp4` has the edited audio and picture.
`edit/narration.wav` is available independently. Use this workflow's rough cut
and timing map for composition. Review the rough cut before detailed animation.
