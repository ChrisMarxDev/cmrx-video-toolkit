---
name: audio-effects
description: Add localized voice effects to selected words in existing narration, with short audio comparisons and preserved speech timing. Use for subtle flutter, wobble or glitch emphasis; not music generation or whole-track mastering.
---

# Audio effects

Use the creator's selected sound and strength. The included helper implements
pitch flutter only; stutter/distortion require separate processing and auditioning.
No brand preset is implied by its example parameters.

Select individual words with semantic purpose. Read the transcript, then measure
and listen around each boundary; segment timestamps are not word alignment.
Record source/clip identity, the selected word, time base and parameters in the
project's edit notes. When cuts change, reconcile the source-to-output map before
reusing cues. The helper uses seconds on the input WAV's clock, not automatically
source-media or final-output time.

Prepare a short original/processed comparison with clean sentence context. Keep
speech intelligible, fades short and duration unchanged. Audition levels as well
as texture: equal RMS is a useful baseline, not a guarantee of equal perceived
loudness. Reuse an already approved sound without asking for approval again;
a new recording may require strength adjustment.

## Local flutter helper

Python 3.10+ standard library only. Use a mono/stereo PCM16 WAV; decode other
formats with the existing FFmpeg installation into a new project-local file.
Do not overwrite originals. Save the JSON command output with the edit notes.
For example, from the toolkit root, using **measured** input-file seconds:

```sh
make audio-flutter INPUT=/absolute/narration.wav OUTPUT=/absolute/flutter.wav \
  START=1.2 END=1.8 RATE=24 DEPTH_MS=1 MIX=0.4
```

For a separately installed skill, call its bundled helper directly:

```sh
python3 /path/to/audio-effects/scripts/flutter_word.py \
  --input narration.wav --output flutter.wav --start 1.2 --end 1.8 \
  --rate 24 --depth-ms 1 --mix 0.4
```

Rate controls flutter speed, depth-ms the sinusoidal sample displacement, and mix
its wet fraction. The helper applies 18/25 ms effect fades, then matches the
selected window's RMS with a shared stereo gain. It rejects clipping and existing
output paths. Sample count, sample rate, channel count and samples outside the
selected window remain unchanged. Processing loads the WAV in memory; prefer
per-clip narration to a long recording. Preserve each intermediate if processing
multiple words sequentially; do not process an overlapping word twice.

Replace that clip's narration in the editable composition, muting its original
audio to avoid doubling. Do not layer the full processed narration over the dry
track: the helper already blends dry and wet. Verify joins and lip sync in context,
and retain source files plus edit notes so the effect can be removed or retuned.
