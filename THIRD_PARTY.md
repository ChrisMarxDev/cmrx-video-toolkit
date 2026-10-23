# Third-party notices and provenance

No brand fonts are bundled. Flutter project scaffolding
and default platform icons originate from Flutter tooling. Flutter, Fluvie and
other dependencies are resolved through pubspec manifests/lockfiles; their licenses
remain applicable. No dependency source or downloaded model is vendored here.

Dither/ray-march shader implementations and synthetic browser media generators
were authored in this project. Paper is a research reference, not copied source.
No meme images, external brand-logo collections, client portraits, or private brand archive
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
walkthrough (2026-10-23), published at his request. The finished video is hosted
separately as a GitHub user attachment for inline README playback; the
`walkthrough-demo` release retains an optional download. The original recording,
transcript and editable production project are not included in this repository.
The recording and likeness are not covered by the toolkit's MIT software license;
third-party marks in the demonstration remain owned by their respective owners.
