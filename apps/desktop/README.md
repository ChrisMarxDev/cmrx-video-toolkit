# Desktop video playground

A local video workspace with subscription-backed chat, one composited player,
editable footage/audio and arbitrary Flutter graphics. Start from a video or an
empty project, describe an edit, then seek, trim and leave timed comments.

**Developer preview.** Linux is the currently tested platform. This is not yet a
self-contained download for nontechnical users. macOS packaging and the native
render worker still need implementation and acceptance testing.

## Run from a checkout

Use Node.js 22.12+, npm, Electron 43, FFmpeg/ffprobe, Flutter and the pinned Fluvie
runtime. Linux rendering additionally needs Bubblewrap with working user namespaces.
See [external requirements](../../docs/EXTERNAL-REQUIREMENTS.md#desktop-playground).

From the toolkit root:

```sh
make desktop-install
make desktop
# Open a specific folder instead of restoring tabs:
make desktop WORKSPACE=/absolute/path/to/project
```

The app starts disconnected. Settings → Providers prepares the selected official
provider CLI and guides account sign-in; users do not need a globally installed
Codex or Claude CLI. Subscription eligibility and provider limits apply. This
manages the provider runtime only, not Flutter or the media/compiler toolchain.

A workspace contains shared `assets/`, `skills/`, `AGENTS.md` and `projects/`.
Each project has visible source, media, timeline and chat files. The + menu
creates/opens workspaces and project tabs; both restore across launches. Shared
creative files stay in the workspace, with credentials and toolchains device-local.
See [workspace structure and Git boundaries](WORKSPACES.md). Old `.cmrx-editor/`
projects remain supported in place.

## Agent and editing

The chat agent can author source, add timeline clips, inspect assets, research,
use configured MCP/HTTP connections and build small sandboxed HTML tools. Generic
connections and named secret keys are configured in Settings; no publishing service
is hardcoded. Credentials and project media must never be committed to this repo.

Project instructions, memory and skills are discovered from the project folder;
workspace skills can be installed through Settings. The toolkit skill catalog and
[video-project skill](skills/video-project/SKILL.md) supply editing guidance.
Arbitrary source runs through the offline rendering worker. The provider agent
and network-capable connection broker are separate processes from that worker;
this is not an operating-system sandbox around the entire app.

While an agent task runs, Enter queues a follow-up. With a provider that supports
active-turn input (currently ChatGPT), **Send now** or Ctrl/⌘+Enter delivers a
correction into that task without starting another. Waiting messages stay queued.
Idle Send now can run ahead of a paused queue; the queue stays paused. Unsupported
providers keep Stop and Queue. A rejected immediate send preserves your draft.

The layer speaker/eye buttons in the embedded editor are temporary preview controls:
they stay available during agent/render work and never change the timeline or
export. Shift+M/Shift+V toggle the selected layer. Reopening the view resets these
local overrides; tell the agent when a layer should be excluded from the export.

Generated graphics remain distinct clips above footage. Trim/split/delete and
undo preserve their source timing. Preview and export use the same composition;
rendered drafts do not replace the underlying editable project. Heavy rendering
is serialized across tabs. See [asset library](ASSETS.md).

## Verify

```sh
make desktop-check
# Optional UI acceptance; provide an existing Playwright installation:
make -C apps/desktop browser-check EDITOR_PLAYWRIGHT=/path/to/playwright
make -C apps/desktop agent-browser-check EDITOR_PLAYWRIGHT=/path/to/playwright
```

Unit/service checks use isolated synthetic workspaces. Native tests also need
Electron and a graphical session. Real provider login and GPU rendering require
separate acceptance; fixture tests do not establish subscription compatibility.

## Releases

App releases belong to this repository and use `desktop-vX.Y.Z` tags, independently
of toolkit versions. See [release procedure](RELEASING.md). Current automation
validates and prepares a **draft prerelease source archive**, not an AppImage or
DMG. No automatic download, install or application restart is implemented.

Graphics preview caches contain independently composited full-resolution tracks.
Older combined caches refresh automatically; per-layer inspection may briefly show
an updating indicator during that first rebuild. Multiple graphics tracks require
additional cache render passes. The stored timeline and full export are unchanged
by preview visibility/mute controls.
