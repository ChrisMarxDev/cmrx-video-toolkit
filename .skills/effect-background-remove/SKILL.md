---
name: effect-background-remove
description: Remove a person’s background from existing footage and produce an alpha video for composition; load only when a cutout is needed.
---

# Remove a background

This effect transforms footage into a local asset; it does not create a component
or change edit decisions. The current tool isolates people using Robust Video
Matting, not arbitrary objects. Read `video_tools/README.md` from the toolkit root.

Use the chosen edited footage and preserve its timeline revision, original source,
and previous outputs. Run `bash video_tools/setup.sh` only when the optional matting
environment/model is needed. Then run the documented `python -m video_tools cutout`
through that environment, starting with a short sample (`--seconds 3`). Choose a new
output path. The result is ProRes 4444 MOV with alpha and a provenance sidecar.

Inspect hair, hands, movement and edge stability before processing the full clip.
Retain the model checksum, source identity and settings. This is estimated matting;
report visible failures rather than promising a perfect mask. Keep generated media
and downloaded models outside software Git, following the consuming workspace.

Hand off the alpha asset, dimensions/fps, duration, timeline revision and quality
limits to the composition stage of [edit-video](../edit-video/SKILL.md). Preserve
one narration stream: mute a presenter inset if the composition already owns audio.
An MP4 background composite loses alpha; preserve the MOV for future revisions.
The RVM model has separate licensing; consult the tool README before redistribution.
