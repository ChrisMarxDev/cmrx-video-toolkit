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
workspace. Load that workspace's art direction; this toolkit imposes no client brand.
Use ingest → transcribe → edit → storyboard → compose → review → render. Reuse valid
artifacts when revising. Keep original recordings immutable and one narration audio
stream. Review the rough cut before detailed animation unless already approved.
Resolve source cues through scripts/video.py import-edit; never guess timestamps.
Default to live Fluvie composition preview before encoding. Render only after
preview feedback and explicit export approval, or an explicit export request. Final approval is a human decision, not a CLI flag.
Read only the stage reference needed for the current work before using a command. Keep media outside Git.

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

When a creator wants to define or revise their identity, use
[video-style](../video-style/SKILL.md) for a short interview, optional reference
analysis and a workspace-owned design folder. Reuse established direction without
re-interviewing. Storyboarding and composition consume the chosen specification;
style selection does not approve edits or final delivery.

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
returning rendered drafts directly with separate revision workspaces. Read it
before starting a review; do not reproduce or bypass that lifecycle here.

After feedback, continue only the authorized next stage. Keep original reviews and
prior exports immutable. Draft feedback uses rendered-revision time; map it through
the edit timeline when revising source cuts. Done submits feedback, not permission
to render or publish. Final approval remains human.

Consult `docs/EXTERNAL-REQUIREMENTS.md` before setup. Install only requirements for
the requested work; native GPU, matting and generation are optional. Shared review
and rendering tools remain in their existing locations.
