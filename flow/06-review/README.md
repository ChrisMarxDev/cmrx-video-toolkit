# Review

Open the rendered draft MP4 in the existing review editor so the user can highlight
sections and leave comments. Follow `.skills/video-review/SKILL.md` for opening a
separate review workspace per render revision, waiting for Done, and retrieving
feedback. Apply that feedback to the composition and render again as needed;
comment times belong to the reviewed draft, not the original recording.

Use live preview for visual feedback and a draft MP4 to verify actual encoded audio and video. Keep review/feedback.md with pending/resolved items. After new cuts, regenerate the rough cut and reconcile storyboard and Dart cues before updating their revision manifests. `video.py qa` probes duration and extracts three frames; inspect and listen manually too.

Commands run from the toolkit root; `video.py` means `python3 scripts/video.py`.
