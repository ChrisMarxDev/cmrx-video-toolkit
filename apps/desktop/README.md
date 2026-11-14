# Desktop video playground

A local video workspace with subscription-backed chat, one composited player,
editable footage/audio and arbitrary Flutter graphics. Start from a video or an
empty project, describe an edit, then seek, trim and leave timed comments.

The app is a development environment and UI for the full toolkit. Flutter
components are authored dynamically; optional controls come from their schemas.
Source inspection combines frames, sound levels and timed text. For video that
needs arbitrary processing beyond the timeline, the same player supports verified
rendered review. See [project contracts](../../flow/project/README.md).

**Mac beta 0.1.0:** [download the signed and notarized Apple Silicon DMG](https://github.com/ChrisMarxDev/cmrx-video-toolkit/releases/download/desktop-v0.1.0/CMRX-Chat-Editor-0.1.0-macOS-arm64.dmg).
Requires macOS 15+. Copy the app into Applications and open it; no Terminal or
separate video/developer tools are needed. Connect your own provider account
through onboarding. See [release notes](https://github.com/ChrisMarxDev/cmrx-video-toolkit/releases/tag/desktop-v0.1.0)
for coverage and limits; native acceptance was on macOS 27.0.1 with Apple Silicon.

**Linux developer preview:** a Debian/Ubuntu AMD64 installer candidate bundles
the video SDK and declares native dependencies; clean-machine installation
acceptance remains a separate release gate. Checkout launch uses developer tools.
See [Mac candidate builds](MACOS_BUILD.md) for maintainer packaging instructions.

For the Mac port and installed-app acceptance, use the [Mac agent handover](MAC_HANDOVER.md)
and the app-owned desktop deployment skill.

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

A fresh installation starts disconnected. Saved app connections restore automatically
on subsequent launches until explicitly signed out. Settings → Providers prepares the selected official
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
`app/video-project` is the single bundled app-workflow skill: it covers empty
projects, importing existing videos, editable Flutter layers, cuts, notes, live
preview and verified export. The in-app agent is instructed to load it for video
work; no separate skill installation is needed.
Arbitrary source runs through the offline rendering worker. The provider agent
and network-capable connection broker are separate processes from that worker;
this is not an operating-system sandbox around the entire app.

While an agent task runs, sending a message queues a follow-up. A queued message's
**Steer** button explicitly delivers it into the active task when the provider
supports this (currently ChatGPT). It leaves the queue only after acceptance;
other waiting messages are preserved. Failed steering leaves it queued. There is
no immediate-send shortcut or automatic steering.

The layer speaker/eye buttons in the embedded editor are temporary preview controls:
they stay available during agent/render work and never change the timeline or
export. Shift+M/Shift+V toggle the selected layer. Reopening the view resets these
local overrides; tell the agent when a layer should be excluded from the export.

Generated graphics remain distinct clips above footage. Trim/split/delete and
undo preserve their source timing. Preview and export use the same composition;
rendered drafts do not replace the underlying editable project. Heavy rendering
is serialized across tabs. See [asset library](ASSETS.md).

See [state-machine inventory](STATE_MACHINES.md) for lifecycle ownership, runtime
capabilities and render phases shared by the UI and agent tools.

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

Screen/camera/microphone sources can be recorded separately into project assets
without editing the timeline. See [recording](RECORDING.md) for use, file layout,
permissions and the remaining native-platform verification requirements.

## Preview quality

The player's Preview quality selector offers Auto, 720p, 1080p and Original. Auto
matches the displayed player size and pixel density. Smaller footage and transparent
graphics copies are prepared once in the background and reused from the project’s
`.editor/playback-proxies/` cache; the current video keeps playing while preparing.
The fixed-size status indicator explains preparation or fallback on hover. If
preparation fails, original media stays available; choose another quality to retry.
The selection is remembered for the current tab session.

These are playback copies only. Source assets, project dimensions, source timestamps,
comments, transforms and exports remain full quality. No project revision changes
when selecting preview quality. Original bypasses proxy generation for pixel checks.
Lower-resolution sources are not upscaled. Cached source previews use frequent
keyframes for seeking; transparent graphics retain their alpha channel. Generated
files can be deleted with the other disposable `.editor` caches when the app is closed.


For shared document operations, atomic batches, receipts, media representations,
render snapshots and trusted extension boundaries, see [architecture](ARCHITECTURE.md).
"Full-resolution export" uses the full-resolution render input; incompatible source
recordings may have been normalized at import. Originals remain preserved separately.


For the real Flutter graphics layout contract (including root `Positioned` widgets
and transparent cache output), run `make -C apps/desktop graphics-layout-check`
from the toolkit root with the installed rendering toolchain. It uses an isolated
synthetic project; `CHAT_WORKER_ROOT` can reuse an existing app worker cache.
