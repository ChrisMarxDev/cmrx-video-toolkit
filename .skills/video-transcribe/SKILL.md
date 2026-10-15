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

The review file contains good/bad/comment time ranges with free-text instructions.
Good/bad marks are overlapping suggestions; preserve both sides for the composing
agent to reconcile. Legacy visual requests retain required intent. Timing and
legacy geometry remain approximate guides. Export uses existing version-2
retainedRanges and the pipeline's source/output map; do not cast segments to words.
See flow/02-transcribe/README.md for the preparation workflow.

For mixed German/English, use a multilingual model, not a `.en` model. The engine
defaults to `-l auto` without translation, but whisper.cpp initially selects one language;
this is not reliable per-segment language switching. Report recognition limits
rather than claiming bilingual accuracy. Ready transcripts are cached: model
changes do not replace them. Preserve source-time annotations when preparing or
importing corrected recognition. See the editor README's mixed-language notes.

The agent may configure `language` alongside `model` in the local review home's
settings.json, or use WHISPER_LANGUAGE for app sessions. The preparation CLI has
--language. For German-led mixed speech, a `de` decoding bias can preserve both
languages better than an incorrect English auto-detection; verify on actual audio.
This is not a promise of per-segment auto-detection or error-free transcription.
Do not expose setup commands to the user when an agent can configure them.
