---
name: video-transcribe
description: Prepare local video transcripts in the shared review format with explicit timing precision.
---

# Video Transcribe

Use apps/editor/review.py for standalone transcription and apps/editor/server.py
for interactive review. Both write the same versioned review.json document.
For agent-launched human review, use the MCP App/browser flow in
`.skills/video-review/SKILL.md`; the agent-session launcher uses this same engine.
Read apps/editor/FORMAT.md for the contract. Do not create an incompatible agent-only
transcript. The browser must be able to reopen the CLI-produced review directly.

Run `python3 apps/editor/review.py VIDEO --workspace WORKSPACE --model MODEL`.
Use `--transcript WHISPER_JSON` to import existing source-timed whisper.cpp output.
Windows uses `py -3` instead of `python3`. FFmpeg/ffprobe and local whisper.cpp are
external prerequisites; WHISPER_CLI and WHISPER_MODEL can specify their locations.
Preserve original recordings and raw recognition output. Keep media outside Git.

Whisper segments are not word alignment. Never manufacture word timestamps from
text length. Preserve source time, stable segment IDs, source identity and actual
precision. An empty ready transcript means no detected speech; pending is distinct.
Review text corrections before editing decisions. Existing annotations stay
anchored to source time if a transcript is revisited.

The review file contains good/bad/comment ranges and timed rectangular visual
requests with free text. Their intent is authoritative; timing and geometry are
approximate guides the composing agent can refine. Export uses existing version-2
retainedRanges and the pipeline's source/output map; do not cast segments to words.
See flow/02-transcribe/README.md for the preparation workflow.
