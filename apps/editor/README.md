# Flut Script

A single-recording Flutter macOS editor, launched by a script. Local preparation →
searchable transcript → cuts and source-timed notes → an agent handoff folder.

```sh
cd flut_script
bash tool/setup.sh                  # once: Homebrew tools + multilingual base model
bash tool/open.sh /absolute/recording.mp4
# Optional second argument: a workspace directory outside the repository.
```

Set `WHISPER_MODEL=/absolute/model.bin` to use another whisper.cpp model.
Preparation splits the input into silent `video.mkv` (stream copy), full-rate
`audio.wav`, and a 16 kHz mono `whisper.wav`. Installed `whisper-cli` transcribes
locally. The original is never modified. Preview and export read the original
container to retain its audio/video synchronization; split files remain available.

The workspace defaults to `<video-path>.flut_script/`. Reopening reuses the
transcription and restores `session.json`. Preparation currently runs in the
terminal before the window opens. An incomplete preparation is retained for
inspection; retry with a new workspace directory. Whisper timestamps are
segment-level, not word-level or necessarily sentence boundaries.

Search words to filter passages, then click a result to seek and play its source
time. Uncheck passages to remove them, with undo. Add a note on a passage or at
the playhead; the dialog allows editing source start/end seconds. Cuts and notes
save automatically. The player shows the original, not a live edited preview.

**Export handoff** creates a new uniquely named folder under the chosen directory:

- `edited.mp4`: cut video with original narration, re-encoded H.264/AAC.
- `audio.wav`: audio extracted from that edited video.
- `transcript.srt`: conventional subtitle cues in edited output time.
- `transcript.json`: segment IDs/text with source and output timestamps.
- `timeline.json`: retained source intervals mapped to output intervals.
- `annotations.json`: human notes in original source time.
- `annotations.resolved.json`: notes mapped to edited time, including removed notes.
- `HANDOFF.md`: instructions for the next agent / Fluvie stage.

The standalone `flut-script-segments-v1` schema is explicit about its segment
precision. It does not impersonate the parent workflow's word-based edit
schema. Notes spanning cuts get multiple output windows; fully cut notes stay
marked `removed-by-edit`. Review the exported rough cut before animation.
Export checks duration drift within 150 ms; video frames still quantize joins.
Silences outside deleted speech intervals remain. Selecting every passage disables
export to prevent an accidental silence-only deliverable.

This prototype supports a single video/audio recording, cuts, notes and handoff.
No manual word boundaries, project browser, animation authoring, distribution or
job cancellation. Let processing finish before quitting. App Sandbox is disabled
for installed command-line tools. FFmpeg and Whisper are resolved from Homebrew
locations then PATH. No shell interpolation is used for media arguments.

```sh
flutter analyze
flutter test
flutter build macos --debug
dart run tool/smoke.dart            # synthetic real-FFmpeg export check
```
