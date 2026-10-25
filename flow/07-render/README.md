# Render

Review the live composition first. On an explicit draft export request, run `video.py render projects/<slug>`. For an authorized final export, use `--final --approved`; existing authorization persists. Then run `video.py qa projects/<slug> projects/<slug>/renders/final.mp4`. Preserve main.dart, assets, cut map, and annotations for later changes. No network upload is part of export.

Commands run from the toolkit root; `video.py` means `python3 scripts/video.py`.

Drafts call `buildDraft()` at half width/height; finals call `build()`. Preserve both
entrypoints when editing a generated composition. Raw frame staging needs roughly
width × height × 4 × fps × seconds bytes, plus media staging and encoding headroom.
Use a larger TMPDIR for long HD renders. Lower encode quality alone does not reduce
capture storage.

The current draft/final paths may be replaced. No deliverable archive is required.
Use `qa --draft` for half-resolution drafts; QA reports mechanical checks and
manual checks separately. Static validation runs before every pipeline export.
