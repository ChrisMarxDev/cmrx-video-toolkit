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
