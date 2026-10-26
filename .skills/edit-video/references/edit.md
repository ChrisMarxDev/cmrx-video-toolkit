# Video Edit

Read flow/03-edit/README.md and docs/contracts.md. Use scripts/video.py soundmap
for quiet regions and transcript-linked candidates; detection is not approval to
cut. Save source-timed edit decisions. import-edit produces the authoritative
output timeline. Re-resolve notes/cues after every cut; keep original recordings.

Protect complete spoken endings, including quiet consonants and short words.
Silence/energy detectors and transcript timestamps are advisory, not exact speech
boundaries. Retain source handles around uncertain joins and a short post-speech
hold at the end. Audition every tightened join and the closing sentence before
locking the cut; compare to the uncut phrase. If listening is unavailable, expose
that limitation and request human listening in preview; recognition, waveform,
frame/decode checks and successful renders cannot establish audible completeness.

Run `prepare-clips <project>` to create reusable per-range footage and metadata.
Give retained ranges stable `clip_id` values; use `adjust-clip <project> <clip_id>
--start <source-seconds> --end <source-seconds>` for later boundary changes.
Prepare again to encode only changed ranges, then reconcile all shifted scene and
caption cues. Read docs/contracts.md for cache and word-to-range conversion limits.
Implement retained ranges as source clips in Fluvie scenes. Review rough-cut
pacing and scene joins in the live composition before refining its visuals.
Do not require `cut` or a full rough-cut.mp4 before scene construction. The cut
command remains an explicit export/diagnostic option, not the default handoff to
composition; the source-to-output timeline is the handoff.

## Optional visual evidence before cut decisions

When source review needs to locate posture changes, held changed positions or
possible notes checks, use the standalone visual map alongside transcript/audio
review. Skip it for graphics-only revisions or when existing source review is
sufficient. Read `tools/visual_map/README.md` in the located toolkit first.
This is an agent-operated inspection aid, not an automatic pipeline stage.

From the toolkit root, start with defaults in a new directory outside Git:

```sh
make visual-map VIDEO="/absolute/original.mp4" OUTPUT="/absolute/analysis/default-01"
```

Inspect the original near the reference time and compare candidate windows with
known events. An empty chair, setup frame, lighting change or persistent camera
change can keep reference differences elevated for most of the recording. Report
runtime, source duration, sample/candidate counts and the sum of merged review
window durations (plus percentage of source duration). If review covers most of
the recording, say that it does not meaningfully prioritize review; do not call
broad coverage successful event detection.

When the reference is unsuitable, a separate tuned run may use
`--reference-seconds` with an inspected representative presenter pose. That value
is relative to the first sampled image; earlier reference measurements are null.
Optionally choose a manual `--region` or aspect-matched dimensions using the tool's
coordinate rules. Keep the default artifacts, explain each changed parameter and
compare coverage again; tuning is not a demonstrated improvement until inspected.
Use the direct Python CLI for these options. Do not repeatedly tune thresholds just
to obtain a desired count or describe unvalidated settings as a fix.

Inspect original frames or short excerpts across movement, hold and return, plus
some unflagged footage for misses, with nearby speech/transcript context. Pixels
alone do not establish gaze, notes-reading or bad delivery. Record confirmed events
separately from hypotheses; ask for clarification when meaning affects an edit.
Keep analysis and extracted media outside Git and honor host UI permissions.

Use `review_start` / `review_end` only to locate passages in original source time;
the resampled grid is not an exact cut boundary. The JSON is not an edit file and
must not be imported as cuts. Only independently reviewed editorial decisions enter
the normal edit/import-edit flow, preserving complete speech and source handles.
