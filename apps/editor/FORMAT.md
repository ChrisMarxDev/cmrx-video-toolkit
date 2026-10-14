# Shared single-video review document

`review.json` is UTF-8 JSON, `format: "video-review"`, `version: 1`.
Both `review.py` and the browser app produce and consume this contract.
Machine schema: `schemas/video-review.schema.json` at toolkit root. The Python
`review.validate` function additionally checks ranges, identity uniqueness,
rectangle bounds, chronological transcripts and keep/cut conflicts.

```json
{
  "format": "video-review",
  "version": 1,
  "revision": 0,
  "source": {
    "path": "source/original.mp4",
    "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
    "duration": 12.0,
    "width": 1920,
    "height": 1080
  },
  "transcript": {
    "time_base": "source",
    "granularity": "segment",
    "status": "ready",
    "segments": [
      {"id": "s000000", "source_start": 0.4, "source_end": 3.2, "text": "This is an example."}
    ]
  },
  "marks": [
    {"id": "m1", "kind": "good", "source_start": 0.4, "source_end": 3.2, "text": "Keep this explanation"}
  ],
  "objects": [
    {"id": "o1", "source_start": 1.0, "source_end": 3.0, "text": "Add a giraffe", "rect": {"x": 0.6, "y": 0.1, "width": 0.3, "height": 0.5}}
  ]
}
```

The example hash is a placeholder. Producers calculate the actual SHA-256 of the
original file. Paths resolve relative to the review document, or may be absolute.
Relinking requires an identical hash. One document owns exactly one source.
`width`/`height` describe the displayed, rotation-corrected original video, not its
letterboxed browser container. Rectangles use normalized top-left x/y and width/
height in that coordinate space; each rectangle has a single source-time lifetime.
Each object ID is also its stable lane identity. Display order follows array order.

All times are finite seconds in half-open `[source_start, source_end)` intervals,
within source duration. Transcript segments are source-ordered/nonoverlapping;
IDs remain stable during review. `pending` means recognition has not succeeded;
`ready` with an empty list means no speech was detected. Raw whisper.cpp output
is preserved separately. Correcting or regenerating a transcript must not invent
word alignment or silently renumber annotations; annotations are source-timed.

Mark kinds: `good` is must-keep, `bad` is must-cut, `comment` is context. Mark text
may be empty. Object text must be nonempty. IDs are unique across marks and objects.
Good/bad overlaps are invalid, but comments and objects can overlap anything.
Same-kind mark overlaps are allowed; cut intervals are unioned for rough exports.
Only bad ranges are cut; untouched silence and unmarked footage stay available.

Intent is authoritative; exact timing and placement are approximate. There is no
hard-coded tolerance or suggestion mode in v1. Export preserves source intent and
adds explicit `timing: "approximate"`, `placement: "approximate"` and authority to
pipeline annotations. The source-to-output map describes the actual rough cut,
not hypothetical agent adjustments. Any later timing refinement must regenerate
that map and resolve annotations again.

Browser saves use optimistic `revision` plus source fingerprint. Source metadata
and transcript timing are immutable through the annotation endpoint. Save writes
are atomic. Projects use ordinary local files; no database or server account is
needed. Export does not mutate the saved review or original recording.
