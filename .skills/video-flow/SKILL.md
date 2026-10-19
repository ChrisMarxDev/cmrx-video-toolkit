---
name: video-flow
description: Orchestrate a local video workflow with source integrity, reviewed edits and deterministic renders.
---

# Video Flow

Read README.md and docs/contracts.md. Work in an external or ignored projects/<slug>
workspace. Load that workspace's art direction; this toolkit imposes no client brand.
Use ingest → transcribe → edit → storyboard → compose → review → render. Reuse valid
artifacts when revising. Keep original recordings immutable and one narration audio
stream. Review the rough cut before detailed animation unless already approved.
Resolve source cues through scripts/video.py import-edit; never guess timestamps.
Drafts can be rendered for review. Final approval is a human decision, not a CLI flag.
Read the matching stage skill below before using a command. Keep media outside Git.

## No-terminal user experience

Run setup and launch commands yourself when your host permits it. Never ask a
nontechnical user to open a terminal, paste a command, edit MCP configuration or
manage a background server. Commands in this skill are agent/developer instructions.
Prefer an installed plugin/tool; if setup needs a host restart or a graphical
permission, give the user that single UI action. If you cannot perform setup,
explain the missing capability instead of claiming installation succeeded.

## Human recording review

Read `.skills/video-review/SKILL.md` for the shared MCP App/browser review flow.
Use `open_review` with a local path when supplied, or without a path so the user
can select a video in the editor. Do not require a chat video upload.
Prefer the configured `open_review` MCP tool: supporting hosts show the editor
inline; other hosts open its `browserUrl`. Without MCP, launch
`python3 apps/editor/agent_session.py VIDEO --workspace WORKSPACE --open --wait`.
Keep that command running until the human clicks Done. Both paths use the same
editor and canonical review.json; browser fallback must remain first-class.

After Done, call `get_review` or read the CLI's final JSON result and its approved
artifact. Respect keep/cut/comment intent, then continue only the agreed next
stage. Tool session data does not imply the UI failed to display. Never finish
on the user's behalf, infer approval from a closed view, or render merely because
review completed. Remote cloud MCP connectivity and packaging are separate from
local stdio support; do not tunnel the full app using the synthetic demo setup.

Consult `docs/EXTERNAL-REQUIREMENTS.md` before setup. Install only requirements
for the requested workflow; optional native GPU, matting and developer tools are
not prerequisites for ordinary video review. Keep that inventory current when
changing dependencies, with the goal of reducing user-managed installations.
