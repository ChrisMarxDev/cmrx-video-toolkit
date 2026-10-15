# Video Review

A local, single-recording review tool for **Linux, macOS and Windows**. Open a
video, prepare audio and a timestamped transcript, mark what to keep/cut, and draw
timed visual requests. The browser is the interface; Python runs media processing
on your computer. No account, hosted service, uploads to third parties, Node build,
or Flutter installation is needed for the editor.

## Run

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
marks and timed rectangles. Original media is immutable. Full-rate WAV narration,
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

- Click a transcript passage to select and seek; Shift-click extends the range.
  Search filters the transcript without changing annotations.
- Drag across the recording timeline row, or edit From/To. Mark **Must keep**,
  **Must cut**, or **Comment**. Each mark is editable; overlapping contradictory
  keep/cut decisions require resolution. Unmarked footage remains untouched.
- **Draw visual request**, drag a rectangle on the video, and type an instruction
  such as “add a giraffe.” It uses the selected range, or three seconds at the
  playhead when no range is selected. Each request has its own timeline row.
- Drag a bar to move it; drag either edge to change its lifetime. Select a box to
  move it or resize its bottom-right handle. Arrow keys nudge selected bars/boxes;
  Shift increases bar nudges or resizes boxes. Requests can overlap in time.
- Changes autosave. Undo/redo cover marks, requests, geometry and timing.
  Space plays/pauses; I/O set range boundaries outside text fields.
- **Skip cuts** previews retained footage by seeking over marked cuts. This is an
  approximate browser preview; render a rough cut for an accurate joined file.

Keep/cut decisions and visual wishes are authoritative **intent**. Their selected
time boundaries and rectangular placements are approximate guidance. The agent
can refine the execution and add other visuals; requests are not a complete
storyboard. No suggestion mode, generator integration, keyframes or final graphics
rendering is included in this review tool.

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
search, keep/cut/comment entry, box drawing/move/resize, timeline dragging, undo/redo,
autosave/reload and rendered export. Screenshots at desktop and narrow widths and
`ui-evidence.json` are saved under the fixtures' `browser-tests/` directory.
These environment variables are test-runner inputs, not app configuration.
