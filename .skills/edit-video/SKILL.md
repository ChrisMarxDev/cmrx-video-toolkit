---
name: edit-video
description: Create, edit or revise videos in a local video workspace with transcript editing, reusable Flutter components, creator-owned styling, human review and Fluvie rendering. Use as the main entry point for the complete video workflow.
---

# Edit Video

Coordinate the CMRX Video Toolkit workspace from recording or media assets to a
reviewed video. Reuse its component library, browser and editing tools, with the
creator's own visual identity. The toolkit and Fluvie are MIT licensed; optional
generation services and third-party assets have their own terms.

First follow [tooling readiness](references/tooling.md): locate the toolkit, reuse
installed tools, prepare only the requested capabilities and verify them. Then
read the toolkit README.md and docs/contracts.md. Work in an external or ignored projects/<slug>
workspace. Resolve the style using “Establish video style” below before creative
decisions; this toolkit imposes no client brand.
Use ingest → transcribe → edit → storyboard → compose → review → render. Reuse valid
artifacts when revising. Keep original recordings immutable and one narration audio
stream. Review the rough cut before detailed animation unless already approved.
Resolve source cues through scripts/video.py import-edit; never guess timestamps.
Default to live Fluvie composition preview before encoding. Render only after
preview feedback and explicit export approval, or an explicit export request. Final approval is a human decision, not a CLI flag.
Read only the stage reference needed for the current work before using a command. Keep media outside Git.

## Core workflow: build scenes, then render

Divide the edit into coherent Fluvie scenes referencing retained ranges of the
original recording. Prepare reusable per-range footage with `video.py prepare-clips`;
keep stable clip IDs and source/output metadata, and use `adjust-clip` for boundary
changes (see the edit reference). Construct footage, graphics, captions, transitions and sound
together in those scenes, and assemble them into one editable Fluvie Video.
The rough cut is an early state of this same composition, reviewed in live Fluvie.
Do not generate a full cut video first and use that flattened video as the base
for graphics. Iterate scenes and their joins in live preview; render the assembled
composition only for an explicitly requested or approved export. Per-clip proxies,
short diagnostic excerpts and audio preparation are allowed when needed; repeated
full-video encoding is not an editing stage. Preserve source-to-output mappings
and one coherent narration stream across scene boundaries.

## Entry point and stage routing

Invoke `$edit-video` to edit a recording, build a video from assets, or revise an
existing composition. Inspect existing artifacts first and enter at the needed
stage; the whole toolkit is available, but completed work need not be repeated.
Paths in commands are toolkit-root-relative; skill links are file-relative.

- New recording/workspace: [ingest](references/ingest.md).
- Missing or incorrect recognition: [transcribe](references/transcribe.md).
- Cut decisions or changed narration: [edit](references/edit.md).
- Visual plan: [storyboard](references/storyboard.md).
- Placement and timeline integration: [compose](references/compose.md).
- Export and delivery checks: [render](references/render.md).

Load [fluvie-compose](../fluvie-compose/SKILL.md) for framework authoring and
[fluvie-render](../fluvie-render/SKILL.md) for framework export mechanics.
Use [fluvie-validate](../fluvie-validate/SKILL.md) to check changed Dart before preview/export.
Use [component-select](../component-select/SKILL.md) when a component choice is
missing; consume an existing valid selection directly. Use
[component-author](../component-author/SKILL.md) for new geometry. Load component
specialists only for their implementation or integration constraints:
[shaders](../component-shaders/SKILL.md), [3D](../component-3d/SKILL.md),
[dithering](../component-dithering/SKILL.md).
Use [effect-background-remove](../effect-background-remove/SKILL.md) only for
person cutouts, and [fluvie-generative-ai](../fluvie-generative-ai/SKILL.md) only
when generation is part of the request. No generation keys/models are required
for ordinary editing. Tools and libraries stay shared; skills do not own copies.

## Establish video style

Follow [video-style: resolve the style](../video-style/SKILL.md#resolve-the-style-before-creative-decisions)
for every new video or resumed project before style-dependent work. Reuse an explicit
or recorded selection; otherwise interview when no usable style exists, automatically
use the sole usable style, or ask the user to choose when several exist. Wait for
required answers while continuing independent preparation. A requested new style
gets its own interview, not an overwrite of the existing style.

Persist the canonical style reference and version in the video's direction/manifest.
Editorial planning, storyboarding and composition read that selection and its scoped
overrides. Revisions keep it unless a change is requested. Style selection does not
approve edits, exports or final delivery.

## No-terminal user experience

Run setup and launch commands yourself when your host permits it. Never ask a
nontechnical user to open a terminal, paste a command, edit MCP configuration or
manage a background server. Commands in this skill are agent/developer instructions.
Prefer an installed plugin/tool; if setup needs a host restart or a graphical
permission, give the user that single UI action. If you cannot perform setup,
explain the missing capability instead of claiming installation succeeded.

## Human review and revisions

Use [video-review](../video-review/SKILL.md) for the editor's MCP/browser lifecycle,
including setup, waiting for explicit Done, retrieving canonical feedback and
returning rendered drafts directly with temporary review workspaces for the current output. Read it
before starting a review; do not reproduce or bypass that lifecycle here.

After feedback, continue only the authorized next stage. Keep original reviews and
prior exports immutable. Draft feedback uses rendered-revision time; map it through
the edit timeline when revising source cuts. Done submits feedback, not permission
to render or publish. Final approval remains human.

Consult `docs/EXTERNAL-REQUIREMENTS.md` before setup. Install only requirements for
the requested work; native GPU, matting and generation are optional. Shared review
and rendering tools remain in their existing locations.
