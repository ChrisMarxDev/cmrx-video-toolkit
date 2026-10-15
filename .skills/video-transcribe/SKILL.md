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

## Language-aware preparation

- Use the user's current conversational language as an initial hint, not proof of
  the recording's language. Explicit instructions about the audio take priority;
  verify against a short audio sample or existing transcript when available.
- Match the decoding language to the recording: `de` for German-led speech, `en`
  for English-led speech, or `auto` when unclear. Do not carry a previous video's
  German/English setting into a new recording without checking it.
- For mixed-language or uncertain recordings, use a multilingual model, never an
  English-only `.en` model. Preserve each passage's spoken language; do not translate
  the transcript just to match the language of the chat.
- Configure the supported language setting before recognition. Do not change the
  user's saved defaults solely because their chat language changes. Ask one short
  question only if conflicting evidence prevents a reasonable choice.
- Spot-check recognition, including a language switch when present. Correct the
  setting if the model translates or mangles speech; disclose remaining errors.
  Preserve existing annotations and ready transcripts when trying another setting.


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
