# Third-party notices and provenance

No brand fonts are bundled into reusable components. The desktop applications
bundle separately licensed application typography as described below. Flutter project scaffolding
and default platform icons originate from Flutter tooling. Flutter, Fluvie and
other dependencies are resolved through pubspec manifests/lockfiles; their licenses
remain applicable. No dependency source or downloaded model is vendored here.

Dither/ray-march shader implementations and synthetic browser media generators
were authored in this project. Paper is a research reference, not copied source.
No meme images, client portraits, or private brand archive
is included; the explicitly approved creator walkthrough preview is noted below. Public example component styling is illustrative and not a grant of
exclusive rights to the CMRX name.

The optional fal connector resolves `@fal-ai/client` (MIT) through its npm
manifest and lockfile; it does not vendor the SDK. fal service/model terms and
output rights are separate from this repository's software license. See
[the official client](https://github.com/fal-ai/fal-js).

Fluvie skill guidance is adapted from SimonErich/fluvie commit
10e442c1bb469118516df3335547f85ec92155e6: `.agents/skills/fluvie-video/SKILL.md`
and `documentation/guides/generative-media.md`. Copyright (c) 2026 Simon Auer,
MIT; the full notice is retained as LICENSE.txt in each fluvie-* skill. Adaptations
split framework mechanics from toolkit orchestration and retain local media policy.

## Fluvie preview compatibility patch

`tools/previewer/patches/fluvie-preview-assets-await.patch` contains minimal context
from SimonErich/fluvie revision `10e442c1bb469118516df3335547f85ec92155e6` and a
toolkit-authored asynchronous asset-loader fix/cache-stamp change. Upstream is MIT,
copyright 2026 Simon Auer; its notice is retained beside the patch. The previewer
runs separately installed Fluvie software; it does not vendor that runtime.
The sibling playback and shader patches use the same upstream revision and MIT
notice. The shader patch adds declared-file linking, a cache stamp and a synthetic
regression test.

## Creator walkthrough

`docs/public/walkthrough-preview.jpg` is a still from Chris Marx's approved toolkit
walkthrough (2026-10-23), published at his request. The approved finished video (v7 styling refresh, 2026-10-26) is
tracked at `docs/public/toolkit-walkthrough.mp4` at his explicit request and linked
directly from the README. The original recording,
transcript and editable production project are not included in this repository.
The recording and likeness are not covered by the toolkit's MIT software license;
third-party marks in the demonstration remain owned by their respective owners.


## Optional speech evidence models

The toolkit-authored alignment/VAD adapter uses separately downloaded models; it
does not vendor model weights or another editor's implementation.
[models.json](tools/media_evidence/models.json) pins their provenance/checksums:

- [Xenova/wav2vec2-base-960h](https://huggingface.co/Xenova/wav2vec2-base-960h),
  ONNX export of [facebook/wav2vec2-base-960h](https://huggingface.co/facebook/wav2vec2-base-960h), Apache-2.0.
- [Silero VAD](https://github.com/snakers4/silero-vad), MIT; model tensor usage
  follows its published ONNX interface.

NumPy (BSD-3-Clause) and ONNX Runtime (MIT) are optional installed packages, not
vendored code. Their notices and model licenses remain applicable separately from
the toolkit MIT license.

## Agent setup logos

`docs/public/agents/` contains Codex, Claude and Cursor icon geometry from
[Lobe Icons](https://github.com/lobehub/lobe-icons), revision
`ea434b96e75813517b377825e01c0df61dee8836`, adapted into labeled README badges.
MIT license retained in that directory; exact sources/checksums in PROVENANCE.json.
Product names and logos belong to their respective owners; identification does
not imply endorsement or guarantee every agent host supports local execution.

## Desktop applications

`apps/desktop/resources/fonts` (Space Grotesk) and
`apps/local-editor/resources/fonts` (Fraunces) contain fonts retrieved from the
public Google Fonts repository, with original SIL OFL1.1 notices and exact source
revision/hashes in adjacent PROVENANCE.json files. These are app-local resources,
not component defaults or a reusable brand archive.

`apps/desktop/resources/brands` includes LobeHub product identity PNGs from
`@lobehub/icons-static-png` 1.97.1 (MIT, Copyright 2023 LobeHub; full LICENSE retained),
and official referential marks for Flutter, FFmpeg, Fluvie and Higgsfield.
The catalog retains source URLs, hashes, transformations and distinct rights.
Trademarks belong to their owners; the toolkit MIT license and LobeHub's source
license do not grant general rights to other product marks. The app icon is a
rasterization of this repository's existing public `docs/public/favicon.svg`.

The desktop CSS acknowledges Damir Sokolovsky's unslop guidance,
https://github.com/heydamir/unslop (CC BY4.0), used for design review. No upstream
skill or private design documentation is distributed. Package dependencies retain
their respective licenses; see the app manifests/locks and external requirements.
