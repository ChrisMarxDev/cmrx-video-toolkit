---
name: desktop-app
description: Develop, debug and design the CMRX desktop video app, its chat agent, JavaScript editor and packaged runtime. Use for work on the app itself, not for creating a video inside it.
---

# CMRX desktop app

## Locate the project

Find the toolkit root containing `apps/desktop/` and `apps/local-editor/`.
In Studio it is the `cmrx-video-toolkit/` submodule; in a standalone checkout it
is the repository root. Resolve paths from that root, not a machine-specific path.
Read applicable AGENTS.md files, then `apps/desktop/README.md`. In Studio, query
its knowledge graph for the affected component; keep private context there.

This skill is app-maintenance guidance. Do not expose it in the video agent's
creator catalog. For editing a user's video, use the app's
`apps/desktop/skills/video-project/SKILL.md` instead.

## Product contract

Nontechnical users install one app, connect their own provider account and start
from a video or an empty project. Required toolchains must be bundled or prepared
automatically. A working developer checkout does not establish installer readiness.

Chat edits are primary. One composited player supports seeking, timed comments
and small manual cuts. Arbitrary Flutter/Fluvie source authoring remains essential;
do not replace it with a fixed template library. Generated graphics remain
editable timeline layers. Smaller playback proxies are disposable; editing and
exports retain full-resolution render inputs and their coordinates/timing. Imports
may normalize recording codec, HDR, rotation or frame rate; preserved recordings
and disposable playback proxies are distinct representations.

Preserve saved provider sessions, project tabs, drafts, queues and user media.
Sending during work queues; steering requires an explicit action. Before restarting
a user's app, check for active agent/render/import work and unsent drafts. Do not
kill active work just to load a UI change.

## Find the owner

Paths below are relative to `apps/desktop/` unless stated otherwise:

- Native window/tabs: `src/desktop.cjs`, `src/desktop-shell.*`, `src/desktop-session.mjs`.
- Chat/onboarding/settings: `src/chat.js`, `src/onboarding.mjs`, `src/agent-settings.mjs`.
- Project service/agent/providers: `src/server.mjs`, `src/project-agent.mjs`,
  `src/codex.mjs`, `src/claude.mjs`. Read `STATE_MACHINES.md` before changing lifecycle and `ARCHITECTURE.md` for
  document transactions, media identities, render snapshots and extension contracts.
- Rendering/toolchain: `src/playground.mjs`, `src/bundled-engine.mjs` and worker modules.
  Provider/network processes are separate from the offline render worker; do not
  describe the entire agent or app as OS-sandboxed.
- Editor/timeline/media service: `../local-editor/src/`. Keep one revision-checked
  editing authority; preserve source/output clock mapping and undo semantics.
- Read `WORKSPACES.md` for portable folder ownership, `ASSETS.md` for asset browsing,
  and `RECORDING.md` for screen/camera/audio capture.

## Design and verification

For UI work, read `DESIGN.md` and the adjacent `design-system/SKILL.md`.
Prefer dithercn for dither direction, neutral working surfaces and expressive
onboarding. Compact controls highlight their whole existing surface; hover adds
no shape or geometry. Keep implementation details out of user-facing flows.

Use the owning Makefile's checks. From the toolkit root:

- `make desktop-check` builds and runs desktop service tests.
- `npm --prefix apps/local-editor run typecheck` checks editor types.
- `npm --prefix apps/local-editor test` checks editor behavior.
- Use focused browser targets in `apps/desktop/Makefile` for changed interactions;
  real login/render acceptance is separate from fixture tests.

For video-path changes, verify a real workflow: import or empty project, agent edit,
new graphics layers, comment/revision, manual cut, preview/audio, export and reopen.
Keep source files intact. Verify output dimensions, duration, audio and actual
frames; an agent's completion message is not evidence. Distinguish Linux, Mac,
checkout and installed-artifact results. Store disposable evidence in task cache.

## Delivery

Use the adjacent `desktop-deploy/SKILL.md` for packaging/signing/release work and
read `RELEASING.md`. Read current release state; do not assume an old version or
pending submission is still current. Ordinary pushes do not publish installers.

In Studio, follow its git-sync/toolkit-maintenance workflow: publish public toolkit
changes first, then the private gitlink/context. Never publish private media,
credentials, profile data or Studio knowledge into the toolkit. Keep public docs
usable without Studio, and update durable project knowledge when behavior changes.
