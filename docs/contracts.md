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
deletions, and no source reordering or speed changes. Optional linked recordings
follow that primary source’s cuts (see below). Independent multi-camera editing,
audio-only input, new voice synthesis, and source reordering are outside the review tool. Manual transcript
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
in `provenance`. Whole measured words are remapped from that evidence; cut-through
words are excluded and recorded in `partial_word_ids`. Source segment captions
and SRT are rebuilt on every import/adjustment. Partial segments remain flagged
in JSON and are excluded from SRT until reconciled; missing source timing clears
stale captions rather than leaving them attached to the old edit. It does not rewrite authored Dart,
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
yuv420p and AAC at 48 kHz, rounding odd source dimensions down to even pixels.
It requires video plus audio. Tagged HLG/PQ HDR is rejected unless the project
explicitly enables `media.hdr_to_sdr` in project.json. That setting uses linear-light
zscale, Hable tone mapping and BT.709 output tags; select a zscale-capable executable
with `media.ffmpeg`. Defaults preserve source color and gain. Optional
`media.video_filter` and `media.audio_filter` accept approved FFmpeg filters, e.g.
a measured fixed audio gain. These settings are included in cache identity and
are reused by editor exports and the optional flattened `cut` command. They are
technical preparation, not inferred creative grading or automatic normalization.
Original-source hashes and timestamps remain authoritative. Inspect/listen to
converted media; the tool does not choose a creator's color or loudness policy.
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

`cut` remains an optional flattened export/diagnostic. The obsolete flattened scaffold has been removed. New compositions use clips;
existing authored compositions remain protected and can be migrated explicitly. No existing production videos are automatically migrated.


## Runtime and export checks

`project.json` may set `composition_project` to an existing Flutter project
directory inside the video workspace (default `composition`). Clip generation,
scaffolding, freshness checks and export all use that directory. Its
`fluvie.json` selects `path`, `entry`, `draftEntry`, and `executable`
for the agent's preview/validate/export tools. Defaults are lib/main.dart, build,
buildDraft and FLUVIE_BIN (then fluvie on PATH). Relative executable paths resolve
from the Flutter project. Use one patched upstream checkout for CLI and package
path overrides; see tools/previewer/README.md. New scaffolds pin fluvie and
fluvie_media to the tested modern source revision. Existing pubspecs are preserved,
including shaders/assets/overrides; the agent must add missing dependencies and
asset declarations rather than replacing them. Any existing authored Dart prevents
scaffolding without --replace, even if it uses a different filename.

Pipeline exports save static validation to review/validation.json and stop on an
invalid/unavailable result. QA saves full-decode, duration, frame-count, frame-rate,
resolution and audio-duration checks. `passed` means these mechanical checks only;
manual_checks_pending lists sync, transitions, captions and creative acceptance.
Boundary samples include the frames before/at/after each cut; use --draft when
checking the half-size draft entry. One current draft/final output is sufficient;
review feedback is tied to exact bytes in a disposable review workspace, not a
mandatory deliverable history. Never replace a file during its active review.

## Optional linked recordings: face + screen

The primary `project.json.source` remains the narration and edit clock. Optional
`companions` link other original recordings to that clock with fixed offsets:

```json
{"id":"screen","path":"/absolute/screen.mp4","offset_seconds":0.5}
```

Place these objects in the project's `companions` array, or use the agent-operated
commands below. **Companion time = primary time + offset_seconds.** A screen file
with 0.5 seconds of extra lead-in has offset `+0.5`. A companion that started later
has a negative offset. Establish this from actual evidence; this feature does not
estimate offsets, repair clock drift or align independent edits automatically.

```sh
make video-link-source PROJECT=/path/project ID=screen SOURCE=/absolute/screen.mp4 OFFSET=0.5
make video-prepare-clips PROJECT=/path/project
make video-compose PROJECT=/path/project COMPANION=screen
# Remove the link, retaining original files and cached excerpts:
make video-unlink-source PROJECT=/path/project ID=screen
```

These targets also forward from the Studio root. The underlying commands are
`video.py link-source <project> <id> --source <file> --offset <seconds>` and
`link-source <project> <id> --remove`. Re-registering an ID updates that link.
`primary` is reserved. IDs follow the same syntax as clip IDs. Stored paths are
absolute; offsets must be finite. Original files are never modified.

Every retained primary range is mapped to each companion and prepared independently
from its original. All members retain the same clip ID and output interval, start
at local zero, and use the project frame rate. Companions must cover every retained
range; an uncovered range fails rather than freezing, padding or stretching it.
Input frame-rate differences are resampled; constant offsets do not correct drift.
Sub-frame synchronization remains limited by source/project frame precision.

The primary must contain video and audio. Companion audio is deliberately removed,
whether or not present, so screen files can be silent and narration is not doubled.
Independent system-audio mixing is not part of this feature. Project media filters
apply to both pictures; primary audio filters do not apply to companions.

`edit/clips.json` stays version 1 for single-source projects. Linked projects use
version 2: existing top-level `clips`, `source`, `source_sha256` and `profile` retain
primary semantics; `companions` contains each ID, path, offset, source hash,
encoding profile and prepared clips. Companion `source_start/end` refer to its
own original file; `output_start/end` remain shared. Changes to any linked source,
offset, membership or prepared asset invalidate composition inputs.

Generated Dart keeps `sourceClips` and `sourceClip('intro')` for the primary.
Use `sourceClip('intro', sourceId: 'screen')` or `companionClips['screen']` for a
linked source. Prepared asset duration is the shared scene interval; both clips
use a trim starting at zero. `compose --companion screen` creates a simple
side-by-side baseline. Without that option the baseline stays primary-only.
Authored compositions are never replaced implicitly. For custom layouts:

```dart
final face = sourceClip('intro');
final screen = sourceClip('intro', sourceId: 'screen');
// Put these in the same Scene, sized/positioned with ordinary Flutter widgets.
Clip.asset(face.asset, trim: 0.seconds.to(face.duration.seconds));
Clip.asset(screen.asset, trim: 0.seconds.to(face.duration.seconds),
    audio: const ClipAudio.muted());
```

Keep the narration-bearing primary Clip mounted when hiding its picture; merely
removing it also removes its audio declaration. The legacy `cut` command still
exports only primary footage; use the Fluvie composition for the combined video.
Review documents remain single-source: select cuts against the primary, then
inspect both sources in live composition. Do not remove useful screen activity
merely because narration pauses. Reprepare after boundary changes, reconcile scene
and caption timing, and update the composition manifest only after that work.

`make linked-sources-test` exercises synthetic fixed-offset recordings, silent
companions, paired cuts, cache reuse and rejection/invalidation behavior. Actual
footage still needs visual and listening checks, especially on long recordings.

When a review workspace itself contains `project.json` for the same primary,
exported review handoffs preserve its companion definitions and validate coverage.
For reviews stored separately, import their `edit/decisions.json` into the existing
linked project with `import-edit`; the review UI cannot infer companion files.


## Optional modular media evidence

[Media evidence](../tools/media_evidence/README.md) defines independent version-1
`speech-evidence`, `mapped-speech`, `cut-evidence`, `media-measurements`,
`targeted-previews` and `composition-render` files. These are derived reports,
not replacement review/edit/scene schemas. Originals and authored artifacts are
never mutated by analysis. Human editorial review and Fluvie/custom-component
composition remain authoritative. Optional speech inference dependencies do not
affect QA, mapping, previews or the editor.

Speech words use original-source seconds, explicit uncertainty/null timing and
source/model/transcript fingerprints. Mapping retains whole aligned words only,
records excluded partial/uncertain words and binds the complete edit map. Cut
checks combine source evidence with output join times; no automatic edits occur.
Media measurements report input-file times and do not change mechanical QA pass
semantics. Silence, black and audio level measurements are not creative verdicts.

Targeted previews select existing clip IDs, 1-based joins or output ranges. Their
manifest distinguishes source-only diagnostics from actual composed render bytes.
Pipeline render receipts bind the source, timeline, authored project and resolved
custom-component/dependency inputs before and after render. Stale inputs prevent
composed-preview reuse. The pinned Fluvie CLI has no arbitrary-range capture; use
live Fluvie when no current export exists, rather than imposing a full render.
No cache TTL, unified service or scene translation is introduced.
