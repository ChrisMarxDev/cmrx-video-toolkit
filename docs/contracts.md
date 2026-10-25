# File contracts and time ownership

All times are finite seconds. Intervals are half-open `[start, end)`.
Original media is immutable. Source time refers to original footage; output time
refers to the edited narration. Never silently substitute one for the other.

## Per-video files

- `project.json`: version, name, absolute original source path, fps, width, height.
- `brief.md`: editorial intent, real domain references, animation wishes.
- `edit/decisions.json`: imported edit JSON; `adjust-clip` writes revised range
  decisions and retains the imported decisions under `provenance`.
- `edit/timeline.json`: source_duration, duration, revision, spans, retained words.
  A span has clip_id, source_start/source_end and output_start/output_end. A word has stable
  source index ID (`w000012`), text, source_start/source_end, output start/end.
  Word IDs survive cuts, but re-transcription can reindex them: reconcile annotations
  against source times and review content if the source transcript changes.
- `annotations.json`: version 1 and notes array. Each note has unique id,
  source_start, source_end, intent, component and presentation
  (`fullscreen`, `overlay`, `presenter`). Schema: `schemas/annotations.schema.json`.
- `storyboard/annotations.resolved.json`: note data plus output windows and status.
  Fully deleted notes have empty windows and `removed-by-edit`; never auto-relocate.
- `storyboard/visual-proposal.md`: quoted narration, proposed visuals, placement
  modes, and planned presenter/infographic duration split for user review.
- `storyboard/scenes.json`: agent-authored visual plan, shape in examples/jev.
  It references the exact timeline_revision. Store narration cue word IDs and their
  resolved output time, visual props, and presentation mode. Agent creates Dart from
  this plan; there is intentionally no arbitrary storyboard-to-code interpreter.
- `composition/lib/main.dart`: the whole-video Fluvie `Video build()` entrypoint.
  It imports the shared package and local media; may call project-specific helpers.
- `composition/manifest.json`, `edit/cut-manifest.json`: timeline_revision used.
- `edit/clips.json`: prepared clip IDs, original source SHA-256, source/output
  ranges, encoding profile, content-addressed assets and measured media durations.
- `composition/lib/source_clips.dart`: generated clip data for authored scenes.
  `sourceClips` is ordered; `sourceClip('intro')` addresses a stable clip ID.
- `review/feedback.md`: feedback and approval context, including which revision.
- `renders/draft.mp4`, `renders/final.mp4`: encoded deliverables.

## Changes and invalidation

Importing changed edit JSON changes the timeline revision. It invalidates the
rough cut, resolved cues, storyboard timing, and composition timing. The CLI refuses
preview/render while clip/composition manifests are stale (cut manifests for the
explicit legacy path). Reconcile the actual Dart
before updating its manifest; never change a revision string merely to bypass it.
Annotation changes require storyboard reconciliation even if narration is unchanged.

The importer preserves natural gaps between retained words in a contiguous run.
Deleted word runs remove those words and the gaps at their cut boundaries. No
crossfade is silently applied because overlapping audio changes duration. The v1
cut uses constant 30 fps; audio remains the timing authority and frame quantization
can introduce small (< one-frame per segment) deviations. The media check tolerates
150 ms overall; inspect long edits and reject accumulated drift rather than widen it.

## Boundaries

v1 supports one original video with audio, ordered nonoverlapping words, word-based
deletions, and no source reordering or speed changes. Audio-only input, multi-camera
edits, new voice synthesis, and source reordering are outside the review tool. Manual transcript
spelling fixes don't create new speech. Cuts may need a re-recorded pickup when a
natural join cannot be made. Reusable scene durations must follow narration, not
compress speech to fit a graphic.

## Edit JSON input

`video.py import-edit <project> <edit.json>` accepts version 1 JSON with
`videoPath` (absolute original recording path), `words` (source-ordered objects
with `word`, `start`, and `end` in source seconds), and `deletedRanges` (objects
with `wordIndices`, zero-based indices into `words`). Use an empty deletion list
to keep all words. Deletions use indices, not range-envelope timestamps.
An empty word list preserves the whole source but supplies no narration cues.
Word times must come from transcription/alignment, never be guessed.

Example shape (synthetic times):
```json
{"version":1,"videoPath":"/absolute/recording.mp4","words":[{"word":"Hello","start":0.2,"end":0.6}],"deletedRanges":[]}
```

The command replaces `import-cutscript`; existing saved `.aive` JSON with this
shape can still be supplied to `import-edit` without installing that application.
Existing saved files are preserved. Reimporting changes the timeline revision;
prepare changed clips and reconcile the composition before preview/render.

## Explicit source-range edits (version 2)

For take selection and measured pause cuts without word alignment, `import-edit`
also accepts `version: 2`, `videoPath`, and a nonempty `retainedRanges` array of
`source_start`/`source_end` seconds. Ranges must be finite, ordered, nonoverlapping,
and within the original source. Do not include `words` or `deletedRanges`.
This produces the same authoritative span map, with `granularity: audio-ranges`
and no invented words. Preserve detector evidence and user authorization in the
edit metadata. Import invalidates the cut, captions, storyboard and composition.

```json
{"version":2,"videoPath":"/absolute/recording.mp4","retainedRanges":[{"source_start":8.2,"source_end":12.5},{"source_start":13.1,"source_end":18.0}]}
```

## Single-video review and approximate visual direction

The local browser editor and standalone transcription CLI share `review.json`
(`format: video-review`, `version: 1`). See `apps/editor/FORMAT.md` and
`schemas/video-review.schema.json`. It holds one original source identity, an
explicitly segment-precision transcript and keep/cut/comment time ranges with
free-text instructions. No fabricated word alignment is needed.

Review export produces the normal version-2 retainedRanges input and standard
project/timeline files. Optional annotation fields `kind`, `authority`, `timing`,
`placement` and `rect` are backward-compatible additions to annotations version 1.
Legacy spatial requests remain supported in stored documents and exports; they
are not created by the current editor. Their bounds are normalized to the displayed
source video, excluding letterboxing.
Timing and placement are approximate guides; the human's intent is authoritative.
The agent may refine execution and add other visuals. A rough export applies the
selected cuts exactly, then maps requests through those actual cuts. Refining cuts
requires a new timeline revision and remapping; never invent an output timestamp.
Fully cut requests remain explicit `removed-by-edit` entries for reconciliation.

## Addressable footage clips

The default scene handoff is separate encoded footage clips, not one flattened
video. Use these agent-operated commands from the toolkit root:

```sh
python3 scripts/video.py import-edit /path/project /path/edit.json
python3 scripts/video.py prepare-clips /path/project
python3 scripts/video.py compose /path/project
python3 scripts/video.py adjust-clip /path/project intro --start 12.0 --end 18.6
python3 scripts/video.py prepare-clips /path/project
```

Supply `clip_id: "intro"` on a version-2 retained range to name it. Missing IDs
receive deterministic initial IDs; exact surviving ranges retain their IDs on
ID-less reimport. Changed ranges must carry their ID explicitly or be changed via
`adjust-clip`. Splits/merges need deliberate new identities; overlap is not used to
guess them. IDs are project-local, unique, start with a letter, and contain at most
64 letters, digits, underscores or hyphens. They are not output version numbers.

`adjust-clip` uses **original-source seconds**, not clip-local or output time.
It rejects out-of-source, reversed and overlapping ranges before writing, keeps
the clip ID, recalculates all output positions and remaps source annotations.
It converts word edits to explicit range decisions, retaining imported evidence
in `provenance`; range edits provide no word alignment. Reconcile any word-based
caption cues against the retained transcript. It does not rewrite authored Dart,
approve an edit, stretch existing footage or encode a final video.

`prepare-clips` writes H.264/AAC MP4s to `composition/assets/clips/` and records
source and output ranges in `edit/clips.json`. Each file starts at local time zero.
Cache keys include original-source SHA-256, source range and encoding profile;
clip ID and output position are deliberately excluded. Changing one boundary
encodes that clip only; unchanged clips survive shifts in output position. Full
source and cached-file hashing verifies reuse, so a warm run still performs disk
reads. A changed source or profile invalidates affected media; corrupt files are
rebuilt. Failed encodes never publish a new complete manifest. Unreferenced cache
files are retained locally; remove the clips directory to reclaim space, then
prepare again. Never remove files while a preview/render uses them.

Encoding currently uses source dimensions, project fps, libx264 fast/CRF 18,
yuv420p and AAC at 48 kHz. It requires video plus audio and performs no HDR tone
mapping, loudness processing or background removal. Tagged HLG/PQ HDR is rejected
before encoding to avoid silently washing out footage. Use an explicit color/audio
preparation workflow when needed, preserving provenance to the original source.
Frame/AAC packet rounding can make the container slightly longer than the requested
range. Metadata retains exact requested duration; generated scenes trim to it.
Check joins and accumulated final-output timing; media probes do not establish
subjective audio quality. Cache reuse accelerates footage preparation only, not
Flutter graphics rendering, and the first run must encode every retained clip.

`compose` now emits one Fluvie scene per clip using `source_clips.dart`, with that
clip's audio included once. The generated data is refreshed by `prepare-clips`;
put custom graphics/captions in authored files. A scene may use several clips or a
clip may span several scenes when deliberately authored; keep audio ownership and
source/scene/output coordinates explicit. Existing compositions are protected.
After a boundary edit, reconcile scene code, captions and storyboard before
updating `composition/manifest.json` to the new timeline revision. Add
`media_mode: "clips"` when adapting an existing composition to this handoff and
set `clips_digest` using `scripts.video.digest()` on the parsed `edit/clips.json`.
This also detects changed source/profile inputs even when cut times are unchanged.

`cut` remains an optional flattened export/diagnostic. The old scaffold is only
available with `compose --legacy-rough-cut`; existing legacy compositions continue
to use their cut manifest. No existing production videos are automatically migrated.
