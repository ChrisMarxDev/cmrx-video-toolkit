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
