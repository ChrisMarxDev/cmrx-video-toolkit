# Render

Run `video.py render projects/<slug>` for drafts. After the user approves, run it with `--final --approved`. Then run `video.py qa projects/<slug> projects/<slug>/renders/final.mp4`. Preserve main.dart, assets, cut map, and annotations for later changes. No network upload is part of export.

Commands run from the toolkit root; `video.py` means `python3 scripts/video.py`.

Drafts call `buildDraft()` at half width/height; finals call `build()`. Preserve both
entrypoints when editing a generated composition. Raw frame staging needs roughly
width × height × 4 × fps × seconds bytes, plus media staging and encoding headroom.
Use a larger TMPDIR for long HD renders. Lower encode quality alone does not reduce
capture storage.
