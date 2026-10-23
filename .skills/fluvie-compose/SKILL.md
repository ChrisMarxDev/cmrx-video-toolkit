---
name: fluvie-compose
description: Author or revise Fluvie Dart compositions using the installed framework API; use for framework-specific scene, timing, media and widget integration.
---

# Compose with Fluvie

This skill supplies framework mechanics. [edit-video](../edit-video/SKILL.md) owns
editorial stages, approved timing and human review; do not restart that process.
For standalone Fluvie work, use the user's requested scope and existing project.

Adapted from the upstream `fluvie-video` skill at commit
`10e442c1bb469118516df3335547f85ec92155e6` (2026-10-23).
Source: https://github.com/SimonErich/fluvie/blob/10e442c1bb469118516df3335547f85ec92155e6/.agents/skills/fluvie-video/SKILL.md
See LICENSE.txt for the upstream MIT notice. Toolkit-specific routing, source-time
rules and private-media storage replace upstream workflow/storage assumptions.

## Ground the installed API

Inspect the project's pubspec and lockfile before using current online examples.
The toolkit component package pins Fluvie 0.3.1; do not upgrade dependencies merely
to use a documented feature. Run `fluvie --help` and, when supported,
`fluvie docs --context`. Otherwise consult the resolved package sources/API and
https://fluvie.dev/for-ai for relevant docs. Verify command flags against local help.

Inspect the existing composition and assets before scaffolding. Preserve authored
code and custom widgets. Use `fluvie assets <directory> --json` only when available;
filenames do not establish asset contents. For a new project use the installed
CLI's documented initialization, or the toolkit's protected compose baseline.

## Author the composition

Prefer readable Dart and the public `package:fluvie/fluvie.dart` API. Upstream
supports a top-level `Video build()`; retain existing project entry conventions.
Use the supplied aspect ratio, duration, visual direction and selected components.
Resolve source cues through the toolkit edit timeline before assigning output time.
Preload fonts, media and shader programs; derive motion from frame/fps, with stable
inputs and no wall-clock randomness. Keep the narration-bearing clip mounted.

Use [component-select](../component-select/SKILL.md) when no selection exists and
[component-author](../component-author/SKILL.md) for new geometry. Load shader/3D
specialists only when needed; native GPU capture is not established web/headless
support. Use [fluvie-generative-ai](../fluvie-generative-ai/SKILL.md) for generated
media or prompt-authored specs, not for ordinary local media composition.

Use [fluvie-validate](../fluvie-validate/SKILL.md) after authoring and before preview/export; run project analysis for broader diagnostics.
Hand off editable code, asset references, timing and unresolved limitations to
[fluvie-render](../fluvie-render/SKILL.md). Compilation alone is not visual review.

References: https://docs.fluvie.dev/getting-started/authoring-with-assets/ and
https://docs.fluvie.dev/reference/cheatsheet/ .
