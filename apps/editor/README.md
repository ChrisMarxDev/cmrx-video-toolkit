# Video Review

A local, single-recording review tool for **Linux, macOS and Windows**. Open a
video, prepare audio and a timestamped transcript, leave short comments on ranges, and mark them keep or cut. The browser is the interface; Python runs media processing
on your computer. No account, hosted service, uploads to third parties, Node build,
or Flutter installation is needed for the editor.

## Run

For agent-driven review, see the [MCP App and browser workflow](../review-agent/README.md).
It uses this same editor, adds Done and a local completion receipt, and offers
`agent_session.py VIDEO --workspace WORKSPACE --open --wait` for agents without
MCP. The ordinary manual launcher below remains supported. See the
[external requirements inventory](../../docs/EXTERNAL-REQUIREMENTS.md) for dependencies by feature.

Install Python **3.10+**, FFmpeg/ffprobe, and (for new transcription)
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) with a GGML model.
Put `ffmpeg`, `ffprobe`, and `whisper-cli` on PATH. `WHISPER_CLI` can instead point
to the whisper executable, including `whisper-cli.exe` on Windows.

From the toolkit root:

```sh
python3 apps/editor/server.py
# Or immediately prepare/open a recording:
python3 apps/editor/server.py /absolute/video.mp4 --model /absolute/ggml-base.bin
```

Windows PowerShell uses `py -3` in place of `python3`:

```powershell
py -3 apps/editor/server.py "C:\Videos\recording.mp4" --model "C:\Models\ggml-base.bin"
```

Open the **complete URL printed by the server**, including its launch token.
The service binds to `127.0.0.1` only. It does not open or automate your browser.
Stop it with Ctrl+C. Use `--port 0` for an available port, or `--port 8092` to
choose another. The web UI offers file selection or a local path and preparation
options. `--workspace`, `--model`, and `--transcript` also work on the command line.
`WHISPER_MODEL` or `--model` supplies the default model path. A successfully used
model path is remembered in the local review home for subsequent app sessions.
Models stay outside the repository.

On macOS, the optional `bash apps/editor/tool/setup.sh` installs Homebrew tools and
a base model, then prints the model setting. On other systems install FFmpeg and
whisper.cpp using their platform instructions. A missing tool/model produces a
visible preparation error; fix it and retry. Completed stages are reused.

## One video, one saved review

A video opened by local path stays in place. Its workspace defaults to
`<video-path>.review/`. A video selected through the browser file picker is copied
into `~/VideoReviews/<id>/original/`; use `--home` to change that location. Choosing
another video saves the current review and replaces it. There is no multi-clip
project or media bin. Processing is serialized and can be cancelled.

The saved **review.json** contains source identity, segment transcript, range
marks with free-text instructions. Legacy spatial requests are preserved for compatibility. Original media is immutable. Full-rate WAV narration,
16 kHz mono transcription WAV, and a browser-compatible H.264/AAC MP4 are derived
under `source/`. Raw Whisper JSON and normalized segments live under `transcript/`.
No-speech recordings can still be annotated; an empty successful transcript is
explicitly different from pending transcription.

Open a saved `review.json` path to resume. Copy its whole folder when moving it;
relative source paths stay portable. If the original was external, copy that too
and use the relink field under Preparation options. Source fingerprints prevent
silently attaching old decisions to a different recording. Keep one editing tab;
stale revisions and cross-video saves are rejected.

For old Flutter editor workspaces, open their `project.json`, or open the original
video with `--workspace /path/to/old.flut_script`. Existing `session.json` cuts and
notes are migrated into `review.json` without rewriting the legacy files. The old
Flutter sources remain for compatibility/reference, but are not the supported
editor launch path.

## Review

The workspace stays within one screen: video and scrubber on the left, transcript
on the right, a comment lane joined to the scrubber by a continuous playhead, and a floating action bar.
The expand button reveals all annotation rows without scrolling inside the timeline;
for very many rows the page grows vertically. Collapse restores the fixed workspace.

- Click empty timeline space to seek. Double-click creates a two-second comment
  range (clamped at the end); drag to select a custom range without a click flash.
  Type a comment, choose green **thumbs-up** (keep), or red **thumbs-down** (cut). Text is optional
  for keep/cut. Click the active thumb again to return to neutral. All comments
  can overlap, including opposite suggestions. Both survive save and export.
- Click a transcript passage to seek and comment; Shift-click extends the range.
  Search filters the transcript without changing annotations.
- Click a comment bar to edit. Drag its middle to move the range or its visible
  end handles to resize. Arrow keys nudge; Shift increases the nudge, Alt adjusts
  the end. Non-overlapping comments share a row; overlaps stack in the same lane.
- Enter saves and closes the popover; Shift+Enter inserts a newline. Escape or
  clicking outside closes it. Empty neutral drafts are discarded. Changes autosave.
- The floating action bar contains Open, Undo, Play/Pause, Redo and Export.
  Space plays/pauses outside text fields. Ctrl/Cmd+Z undoes; add Shift to redo.
- The current UI creates only time-range comments. Existing rectangle requests
  remain visible as comments and retain their geometry in saved/exported files.
  Their text and timing can be edited; thumb controls are disabled for these legacy objects.
  No large inspector, on-video rectangle editing or zoom/timing form is shown.

Comments express human intent for the composing agent. Keep/cut choices still
produce a rough-cut preview of unopposed cut suggestions; overlapping keep/cut
spans remain for the agent to reconcile. Their boundaries are approximate
guidance for later creative work. Generator integration and final graphics
rendering remain downstream. The shared file format is unchanged.

## Standalone transcription uses the same format

```sh
python3 apps/editor/review.py /path/video.mp4 --workspace /path/review --model /path/ggml-base.bin
# Reuse existing whisper.cpp JSON instead of running recognition:
python3 apps/editor/review.py /path/video.mp4 --workspace /path/review --transcript /path/whisper.json
```

The app opens the resulting `/path/review/review.json` directly. An existing
`review.json` may also supply a transcript if its source fingerprint matches.
See [the shared contract](FORMAT.md) and
[video-transcribe](../../.skills/video-transcribe/SKILL.md). Neither path invents
word timing from Whisper segments.

## Export

**Export handoff** writes a new folder under the workspace's `exports/`:

- `review.json`: complete original source-time review.
- `project.json`, `edit/decisions.json`, `edit/timeline.json`: standard pipeline
  project, version-2 retained source ranges and authoritative output span map.
- `annotations.json`, `storyboard/annotations.resolved.json`: keep/cut/comment
  intent and visual requests, including normalized geometry and output windows.
- `transcript/segments.json`: original segment transcript; `output-segments.json`
  and `output.srt`: mapped transcript/captions. Partial segments retain full text
  and are flagged; review captions at cuts because word alignment is unavailable.
- `HANDOFF.md`: how to honor human intent while remaining creative.

Optionally render `composition/assets/rough-cut.mp4` and `edit/narration.wav`.
Rendering checks duration drift within 150 ms. Source and output clocks remain
separate. Requests across cuts get multiple windows; fully removed requests stay
visible as `removed-by-edit`, requiring reconciliation rather than silent loss.
Exports reference original local media and can be used with `scripts/video.py`.
No media render is needed just to hand off direction.

## Verify

```sh
python3 -m unittest discover -s apps/editor/tests -v
node --test apps/editor/tests/model.test.mjs
# Real speech recognition + two-video HTTP lifecycle and rendered exports:
python3 apps/editor/tool/full_flow.py --model /path/ggml-tiny.en.bin --output /tmp/video-review-check
```

The full-flow test additionally needs `espeak-ng` for synthetic narration. It keeps
its two test videos, workspaces, exports and machine-readable evidence outside Git.
The regular suite uses explicit synthetic transcript fixtures and tests landscape
and portrait media, migration, persistence, cut mapping and HTTP access restrictions.
CI runs the regular editor checks on Linux, macOS and Windows. UI interaction must
also be checked in a browser when the host grants automation permission.

For an explicitly authorized browser test, install Playwright in a separate local
folder (`npm install playwright`, then `npx playwright install chromium`). Start
`server.py` with your local Whisper model. Run `tool/browser_flow.cjs` using Node
with `NODE_PATH` pointing to that folder's `node_modules`, `REVIEW_FIXTURES` set to
the full-flow output above, and `REVIEW_URL` set to the server's printed URL
(including its token). Optional `CHROMIUM_PATH` selects an installed executable.
It opens both synthetic recordings in fresh workspaces, checks playback, transcript
search, compact comment creation, keep/cut toggles, timeline movement/edge resizing,
undo/redo, autosave/reload, stable layout, overlap handling, legacy preservation
and rendered export. Screenshots at desktop and narrow widths and
`ui-evidence.json` are saved under the fixtures' `browser-tests/` directory.
These environment variables are test-runner inputs, not app configuration.

### Mixed-language recordings

The recognizer runs locally without the translate flag; the default language is `auto`. Use a
multilingual Whisper model (for example `ggml-base.bin`, not `ggml-base.en.bin`)
for German/English speech. Auto-detection selects a language at the beginning of
the file; it does not guarantee recognition when languages switch mid-recording.
Larger multilingual models may improve accuracy, but mixed-language recognition
still needs review. Existing ready transcripts are reused, so changing the model
alone does not regenerate a saved review. Preserve annotations and source timing
when importing corrected transcription; never delete the review to retry speech.
Reference: [whisper.cpp language detection](https://github.com/ggml-org/whisper.cpp/blob/master/src/whisper.cpp).

Agents can set a decoding-language preference with `WHISPER_LANGUAGE`, or the
`language` field beside `model` in the review home settings.json (normally
~/VideoReviews/settings.json). `/api/open` accepts a `language` override and
remembers it after successful preparation. The standalone preparation CLI accepts
`--language`. Browser and MCP sessions share the saved preference unless their
process environment overrides it. Restart existing sessions to load changed settings.

For German-led recordings with English passages, `de` can avoid an incorrect
initial English detection while still preserving English speech. This is a decoding
bias, not reliable per-segment language detection. Validate against representative
speech; mixed-language and recognition errors remain possible. Leave translation
disabled. Settings affect new recognition, never silently replace ready transcripts.

## Automatic transcription model setup

New transcription reuses a valid model from `WHISPER_MODEL`, the session's model
override/settings, or `~/VideoReviews/settings.json`. Without one, it checks the
shared cache and legacy installation locations, then downloads multilingual
`ggml-base.bin` (148 MB) from the whisper.cpp model repository. The download is
size/SHA-256 verified, atomically installed, cancellable, and reused across
sessions. Progress appears in the editor; interrupted downloads leave no installed
partial model. No model path entry is required. The shared cache is
`$XDG_CACHE_HOME/cmrx-video-toolkit/models` (default `~/.cache`).

whisper.cpp itself and FFmpeg remain prerequisites. Ready transcripts are retained.
A supplied model override is respected; invalid explicit overrides report an error
rather than silently selecting a different model. Saved global language preferences
are not imported into a new isolated session; recognition defaults to auto.
