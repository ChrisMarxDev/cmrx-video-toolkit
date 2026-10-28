# Modular media evidence

Independent local tools for measured word alignment, speech activity, cut checks
and targeted preview artifacts. Human review owns editorial acceptance. The
production artifact remains editable Fluvie scenes with caller-owned styling and
arbitrary custom components. These tools never modify original media, review
annotations, edit decisions, scenes or components; they never apply suggested cuts.

Run modules from the toolkit root. Make targets expose the same commands. All
`OUTPUT` paths must be new directories outside Git; failed runs are not published,
and existing evidence is never overwritten. Reports identify bytes, settings,
implementation checksum and time coordinates. No database, daemon, MCP registration
or network service is required. There is no expiration policy.

## Dependencies and setup

QA, word mapping and preview extraction need Python 3.10+ and FFmpeg/ffprobe.
Preview video encoding needs libx264 and AAC; measurements use blackdetect,
silencedetect and ebur128. Audio-only diagnostics produce WAV without a contact
sheet. There is no NumPy/model requirement for those commands.

Only **speech inference** needs the optional environment:

```sh
python3 -m venv /absolute/evidence-venv
/absolute/evidence-venv/bin/pip install -r tools/media_evidence/requirements.txt
make speech-models MODELS=/absolute/evidence-models
```

`setup_models` is an explicit network operation. It downloads pinned, checksummed
ONNX models and vocabulary to the chosen directory; inference never downloads.
The English quantized wav2vec2 alignment model is about 95 MB and Silero VAD about
2 MB. Model URLs, revisions, checksums and licenses are in `models.json`.
Dependencies are NumPy 2.2.6 and ONNX Runtime 1.23.2; inference uses the CPU provider
with two intra-op threads. No global Python environment is changed.

## 1. Word alignment and speech detection

```sh
make align-speech SOURCE=/original.mp4 TRANSCRIPT=/review/review.json \
  MODELS=/absolute/evidence-models OUTPUT=/new/speech LANGUAGE=en \
  EVIDENCE_PYTHON=/absolute/evidence-venv/bin/python
```

Inputs are the original source and either `review.json` or a source transcript:

```json
{"time_base":"source","segments":[
  {"id":"s000001","source_start":0.2,"source_end":4.0,"text":"Hello world."}
]}
```

Segments must be ordered/nonoverlapping, within the source, at most 30 seconds
each. Break long transcript segments into measured phrase ranges first; never
split text into fabricated equal time intervals. A review document's source hash
must match. Standalone transcript files without a hash are explicitly associated
with the supplied source; the output records hashes of both inputs.

The initial backend supports **English only** and requires `--language en`.
It aligns supplied text; it does not transcribe or correct that text. Numbers,
unsupported characters or punctuation-only tokens mark that segment's words
`unsupported_text`, with null timing. No interpolation fills missing words.
Other statuses: `aligned`, `low_confidence`, `no_speech_support`, `unaligned`.
Confidence is a model score, not a calibrated correctness probability. Correct
text and audible human review remain necessary even for high-scoring alignment.

`speech.json` (`format: speech-evidence`, version 1) contains:

- `source`: path, SHA-256 and duration; `time_base: source`.
- `transcript`: path and SHA-256; `language: en`.
- `words`: ID, segment ID, text, source start/end or null, confidence and status.
- `activity`: 32 ms VAD windows with source boundaries and speech probability.
- `speech`: consecutive windows above the configured VAD threshold, without
  automatic padding, silence merging or editorial interpretation.
- Model provenance, runtime versions, settings and limitations.

Alignment runs per bounded segment; VAD carries recurrent state across bounded
audio chunks. All timestamps describe the original media, never a shortened
export. The model alignment grid is 20 ms; recognition and VAD are approximate.
Missing evidence must not be interpreted as silence or accurate timing.

### Map words for editable captions

```sh
make map-speech SOURCE=/original.mp4 SPEECH=/new/speech/speech.json \
  TIMELINE=/project/edit/timeline.json OUTPUT=/new/mapped-words
```

This consumes the existing toolkit retained-span map and produces `words.json`
(`mapped-speech`, version 1) plus a one-word-per-cue `words.srt` for inspection.
Whole aligned words retain source coordinates and gain output `start/end` plus
`clip_id`. Partial, removed and uncertain words appear in `excluded` with reasons.
Nothing replaces the editor transcript or existing captions. Use these measured
words to author/revise captions in Fluvie/custom components, grouping them according
to the creator's style. Check spelling, punctuation, boundaries and exclusions
with the human. Rerun mapping after cut changes; reports bind the full timeline
content as well as its revision.

## 2. Cut and export measurements

```sh
make check-cuts SOURCE=/original.mp4 TIMELINE=/project/edit/timeline.json \
  SPEECH=/new/speech/speech.json OUTPUT=/new/cut-check EXCERPTS=1
make measure-media MEDIA=/project/renders/draft.mp4 OUTPUT=/new/media-check
```

Speech evidence is optional. Without it word/speech checks are unavailable, not
passing. `check-cuts` produces `report.json` (`cut-evidence`, version 1): each
internal cut's source sides, output time, clip IDs, intersected words, VAD
probability on each side, mono sample discontinuity and RMS levels. It also lists
word intersections at first/last retained edges. Words with uncertain timing
keep that status in the report. The default analysis window is 40 ms, speech
review threshold 0.5 and normalized sample-jump threshold 0.2. These produce
`review_flags`, never a pass/fail verdict or edit action.

With `EXCERPTS=1`, flagged internal joins get short source-cut diagnostics and
contact sheets in `excerpts/` (first 50 flags, omission count reported). Explicit
clip/range selection can inspect outer edges or additional joins. Source-level
sample jumps do not account for authored Fluvie fades or mixing; inspect the
actual composition to judge the audible result.

`measure-media` independently measures black/silent stretches, integrated LUFS
and true peak dBTP. Defaults: silence -40 dBFS for 0.2 s; black pixel threshold
0.1 with picture share 0.98 for 0.2 s. Direct CLI tuning:

```sh
python3 -m tools.media_evidence.quality media --media /draft.mp4 \
  --silence-db -45 --minimum 0.3 --black-pixel 0.1 --black-share 0.98 \
  --output /new/measurements
```

Its intervals use input-file time (`time_base: input`). Null measurements mean
unavailable or below the measurement gate; empty lists mean no measured spans.
Intentional silence/black is valid. `video.py qa` also includes these measurements
in its existing `review/media-check.json`; its `passed` flag still refers only to
mechanical decode/duration/frame checks. If measurement filters fail, the pipeline
retains its mechanical report and records `measurements: null`, an error and a
pending measurement check. Human sync, captions and creative
acceptance remain pending regardless of measured levels.

## 3. Targeted preview artifacts

```sh
make targeted-preview SOURCE=/original.mp4 TIMELINE=/project/edit/timeline.json \
  CUT=1 OUTPUT=/new/join-preview
# Alternatives: CLIP=intro or RANGE=2.5:4.0 (output seconds).
```

Cut indices are 1-based joins between adjacent retained spans. Default radius is
0.75 seconds. Direct CLI supports repeated `--clip-id`, `--cut-index`, `--range`
and `--radius`. At most 50 windows, each at most 30 seconds, keep diagnostics
bounded. A longer selected clip needs an explicit shorter range.

Each output contains encoded excerpts, three-frame contact sheets for video,
and `previews.json` (`targeted-previews`, version 1). Artifact entries carry
output selection, exact mapped source pieces, clip IDs, excerpt-local origin,
media checksum and contact-sheet sample times. Encoding is at most 720 px wide;
frame/audio packet quantization can slightly move diagnostic joins. Excerpts
retain one primary narration track. Contact sheets are inspection aids, not proof
of motion/audio correctness.

### Source diagnostics versus composed output

The default `mode: source-cut-diagnostic` assembles only the requested original
ranges. It deliberately omits authored graphics, companions and audio effects;
it is never represented as a faithful preview of the Fluvie composition.

To inspect an actual composition export:

```sh
make targeted-preview SOURCE=/original.mp4 TIMELINE=/project/edit/timeline.json \
  CUT=1 OUTPUT=/new/composed-join \
  RENDER=/project/renders/draft.mp4 \
  RECEIPT=/project/renders/draft.receipt.json \
  COMPOSITION=/project/composition
```

A successful `video.py render` now writes a receipt next to its export. It binds
render bytes, original-source bytes, the entire timeline and authored Flutter
project/resources to the render. Resolved package source/resource trees are fingerprinted too, including
path-based custom components (generated caches/build directories are excluded).
The snapshot is taken before and after rendering; a change prevents receipt
publication. Verification refuses changed code/components, media or timeline.
For custom code or pubspec assets that read files outside those project/package
roots, list their paths explicitly in `fluvie.json`, for example
`"evidenceInputs": ["../../shared/fonts", "/assets/texture.png"]`. Those files or
directories then participate in the fingerprint; missing paths fail verification.
Fingerprints do not capture network state or unlisted external files. This is a
bounded local-input receipt, not proof of arbitrary code's complete dependencies:
use deterministic components and list external resources explicitly.

A receipt is generated only by an actual successful pipeline render, not by a
command that blesses an arbitrary old file. Excerpts preserve the encoded
composition—including its custom components—without translating its scene tree.
Full-project hashing is deliberate freshness validation and has I/O cost.

The pinned Fluvie CLI supports first-N-frame renders, **not arbitrary-range
capture**. If a current rendered artifact is absent, use live Fluvie to review the
selected ranges. Do not render the full video solely to satisfy this diagnostic
command, silently fall back to source-only output, or replace the production
composition with excerpts. This tool adds no full-video prerequisite.

For human feedback use the existing `video-review` lifecycle. When reviewing an
excerpt, translate its local timestamps using `excerpt_origin` and the source
pieces in its manifest. Done submits feedback; it does not authorize a final
export or publication. Live Fluvie and custom-component authoring remain primary.

## Validation

```sh
make media-evidence-test
make speech-model-test MODELS=/absolute/evidence-models \
  EVIDENCE_PYTHON=/absolute/evidence-venv/bin/python
```

Core tests use synthetic FFmpeg media and no network/models. Optional acceptance
uses espeak-ng narration and the real CPU alignment/VAD models, plus CTC path
checks in NumPy. Model accuracy on real recordings, other accents and noisy audio
must be reviewed per project. No arbitrary-range native Fluvie rendering is claimed.
