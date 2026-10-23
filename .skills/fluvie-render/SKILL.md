---
name: fluvie-render
description: Preview, export and diagnose an existing Fluvie composition with version-aware CLI checks; use for framework rendering rather than editorial decisions.
---

# Preview and render Fluvie

Adapted from upstream `fluvie-video` at commit
`10e442c1bb469118516df3335547f85ec92155e6`; source and adaptation details are in
[fluvie-compose](../fluvie-compose/SKILL.md). See LICENSE.txt for its MIT notice.

Inspect the project lockfile, existing render scripts and `fluvie --help` first.
Confirm each flag with local command help; do not assume latest documentation
matches the installed CLI. Preserve the project's working capture route.

For toolkit videos, [edit-video's render stage](../edit-video/references/render.md)
owns timeline freshness, output naming and delivery QA. The shared pipeline CLI
wraps the export. For direct framework work, where supported, use:

- `fluvie validate <file> --json` before export.
- `fluvie preview <file>` for the framework's live preview.
- `fluvie render <file> --machine` for an encoded deliverable.
- `fluvie review <file> --render --strict-decode --json` for an additional render
  review when supported and the extra render is useful.

Follow host permission rules before opening or automating browser/UI surfaces.
The CLI's live preview is not a toolkit Flutter MCP preview app; that integration
is a future proposal. Never describe a preview as a verified final export.

Check frame count, duration, resolution, audio sync and encoded transitions.
Inspect actual frames and changed audio; preserve editable code and prior exports.
Native-only shader/Scene behavior must be tested on the chosen capture platform.
If generated media is present, use cached/offline assets for repeat renders; do not
silently invoke paid providers. Read [fluvie-generative-ai](../fluvie-generative-ai/SKILL.md).

Report output paths and validation limits. Return authorized drafts through
[video-review](../video-review/SKILL.md) with a separate revision workspace; human
Done submits feedback and does not authorize publication.
Reference: https://docs.fluvie.dev/guides/reviewing-a-video/ .
