# File contracts and time ownership

All times are finite seconds. Intervals are half-open `[start, end)`.
Original media is immutable. Source time refers to original footage; output time
refers to the edited narration. Never silently substitute one for the other.

## Per-video files

- `project.json`: version, name, absolute original source path, fps, width, height.
- `brief.md`: editorial intent, real domain references, animation wishes.
- `edit/decisions.json`: unmodified imported edit JSON.
- `edit/timeline.json`: source_duration, duration, revision, spans, retained words.
  A span has source_start/source_end and output_start/output_end. A word has stable
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
- `review/feedback.md`: feedback and approval context, including which revision.
- `renders/draft.mp4`, `renders/final.mp4`: encoded deliverables.

## Changes and invalidation

Importing changed edit JSON changes the timeline revision. It invalidates the
rough cut, resolved cues, storyboard timing, and composition timing. The CLI refuses
preview/render while cut/composition manifests are stale. Reconcile the actual Dart
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
edits, new voice synthesis, and a comment UI are future extensions. Manual transcript
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
rebuild the rough cut and reconcile the composition before preview/render.

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
