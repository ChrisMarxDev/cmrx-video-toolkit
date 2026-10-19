![CMRX Video Toolkit — open tools and agent skills for programmable video](docs/public/readme-banner.svg)

<p align="center">
  <a href="https://chrismarxdev.github.io/cmrx-video-toolkit/">Documentation</a> ·
  <a href="https://chrismarxdev.github.io/cmrx-video-toolkit/guides/quick-start/">Quick start</a> ·
  <a href="components/CATALOG.md">Components</a> ·
  <a href="https://cmrx.dev">Chris Marx Studio</a>
</p>

# CMRX Video Toolkit

Edit recordings through a transcript, add captions and Flutter animations, and
render videos with FFmpeg. The toolkit includes a browser editor, reusable video
components and skills that guide a coding agent through each stage.

You review the cuts and visual plan before the agent builds the animation. Your
recordings stay on your machine; you supply the colors, fonts and editorial direction.

Python + FFmpeg + Flutter · MIT licensed

## What’s inside

| Tool | What you can do |
| --- | --- |
| [Transcript editor](apps/editor/) | Review keep/cut ranges, add timed visual notes and export an agent handoff. |
| [Component browser](tools/component_browser/) | Explore real Flutter widgets, variants, props and motion. |
| [Video components](components/) | Compose with reusable widgets, shaders, media and deterministic motion. |
| [Dither tool](tools/dither/) | Explore local image/field dithering and export PNGs. |
| [Pipeline tools](scripts/) | Work with edit timelines, soundmaps, rendering and media checks. |
| [Agent skills](.skills/) | Give a coding agent instructions for editing, animation and review. |

## Get started

See the [external requirements inventory](docs/EXTERNAL-REQUIREMENTS.md) for the
minimum dependencies by workflow. Browser review does not need Flutter or Node;
the [MCP App / browser agent flow](apps/review-agent/README.md) adds agent handoff.

For the component-browser build below, install **Python 3**, **FFmpeg/ffprobe** and
**Flutter** (tested with Flutter 3.47.2 / Dart 3.13.2). Other workflows need only
the relevant dependencies listed below. New transcription also needs Whisper and
a model.

```sh
git clone https://github.com/ChrisMarxDev/cmrx-video-toolkit.git
cd cmrx-video-toolkit
python3 scripts/doctor.py
make components
```

Open **http://localhost:8090** to explore the component browser. For agent catalog
search and an optional inline MCP App, use the [component MCP adapter](apps/component-browser-agent/README.md).

For the local Linux/macOS/Windows review app, follow its [setup instructions](apps/editor/README.md), then:

```sh
python3 apps/editor/server.py
```

[Read the full quick start →](https://chrismarxdev.github.io/cmrx-video-toolkit/guides/quick-start/)

## Dependencies and reduction roadmap

These are requirements of today's source checkout, not a single install list for
every user. The [full inventory](docs/EXTERNAL-REQUIREMENTS.md) owns exact workflow,
version and package details; keep this summary in sync with it.

| Dependency | Needed today for | Reduction candidate |
| --- | --- | --- |
| Flutter SDK, including Dart | Building/changing components and compositions, browser builds and current render workflow | Ship prebuilt browsing/review tools; retain a managed SDK for compiling new agent-written Dart. |
| Fluvie package and CLI | Composition playback/capture and pipeline preview/render commands | Pin and provision the CLI with the render toolchain instead of separate manual activation. |
| Python 3 | Review engine, pipeline/media scripts and synthetic browser media generation | Evaluate a compiled Dart service/CLI, porting one tested operation at a time. |
| FFmpeg / ffprobe | Media inspection, audio extraction, cuts, encoding and exports | Bundle or provision compatible binaries; Flutter alone does not replace these operations. |
| Node.js + npm packages | Local MCP adapters; also docs development and JavaScript tests | Evaluate a Dart MCP adapter to remove Node from creator runtime; keep web/docs tooling developer-only. |
| whisper.cpp + model | New local transcription; not needed with an existing transcript | Provision the recognizer on demand. Shared model lookup/download already exists; recognizer setup remains separate. |
| Browser / MCP host | Browser review and component previews; MCP host only for agent integration | Use existing applications; preserve browser fallback. Neither implies installing the Flutter SDK. |
| Native platform tools and libraries | Platform-specific desktop builds/capture; optional native Scene path | Build releases centrally where possible; verify remaining OS/GPU requirements per platform. |
| NumPy, ONNX Runtime + RVM model | Optional person/background cutout | Keep isolated and install only when requested; evaluate a packaged native backend later. |
| Git, Make and development packages | Source setup, checks, docs and contribution | Release packaged tools/assets so ordinary use does not require a developer checkout. |

The direction to evaluate is a **Flutter/Dart application with managed native
helpers**. A packaged Flutter app can run without a user-installed Flutter SDK;
Dart can also compile a standalone CLI. However, an agent adding arbitrary Dart
widgets still needs compilation somewhere. A prebuilt app does not automatically
execute new source code. Media encoding and recognition remain separate engines
unless deliberately replaced. See [Flutter distribution](https://docs.flutter.dev/platform-integration/linux/building)
and [Dart executables](https://dart.dev/tools/dart-compile).

Track each reduction separately; the items below are planned, not shipped:

- [ ] Distribute the prebuilt component browser with its demo assets, removing Flutter/Python/FFmpeg setup for browsing only.
- [ ] Add workflow-specific dependency checks and one agent-operated setup command; reuse the existing model cache/download path.
- [ ] Provision pinned render/media helpers, beginning with Fluvie and FFmpeg/ffprobe, with supported-platform and license checks.
- [ ] Prototype a compiled Dart MCP service against the existing catalog and review contracts; remove Node from creator setup only after parity checks.
- [ ] Consolidate Python orchestration into Dart incrementally, preserving edit timing, review receipts, media handling and failure behavior.
- [ ] Package and test the creator workflow on clean supported machines; distinguish prebuilt use from authoring new Dart components.

For each checked item, record the release/commit, affected workflow, remaining
prerequisites and clean-machine evidence in the full inventory. Bundling a tool
reduces manual installation; it does not remove the dependency or its license.
No runtime has been replaced by this roadmap.

## From recording to finished video

**Ingest → Transcribe → Edit → Storyboard → Compose → Review → Render**

Start with [video-flow](.skills/video-flow/SKILL.md). Review the rough cut before
detailed animation. Map source cues through the edited timeline; do not guess
animation timestamps. Keep recordings, transcripts, models and renders outside Git.

The toolkit is in early development and runs locally. Use the browser editor to
review cuts and visual notes; compose the video in Flutter. Native Scene GPU
capture currently uses a separate macOS path. Check the rendered video before
publishing.

## Skill overview

Ask your coding agent to use a skill by name. Start with `video-flow` for the full
workflow, or choose a focused skill below.

| Skill | What it helps you do |
| --- | --- |
| [video-flow](.skills/video-flow/SKILL.md) | Coordinate the full workflow from recording to reviewed render. |
| [video-style](.skills/video-style/SKILL.md) | Define your video identity through an interview and references; create a reusable design folder. |
| [video-ingest](.skills/video-ingest/SKILL.md) | Prepare a recording workspace while preserving original media. |
| [video-transcribe](.skills/video-transcribe/SKILL.md) | Prepare local transcripts for review with explicit timing precision. |
| [video-edit](.skills/video-edit/SKILL.md) | Turn reviewed edits and audio analysis into source-to-output timelines. |
| [video-storyboard](.skills/video-storyboard/SKILL.md) | Plan explanatory visuals against the edited timeline. |
| [video-compose](.skills/video-compose/SKILL.md) | Build editable Fluvie compositions with toolkit components. |
| [video-review](.skills/video-review/SKILL.md) | Review and revise a video at the relevant stage while preserving prior work. |
| [video-render](.skills/video-render/SKILL.md) | Render and verify edited videos with Fluvie and FFmpeg. |
| [video-components](.skills/video-components/SKILL.md) | Run the browser, discover components through MCP, and add and validate widgets and presets. |
| [component-authoring](.skills/component-authoring/SKILL.md) | Create SVG explainers, editable Flutter diagrams and reusable components. |
| [video-dithering](.skills/video-dithering/SKILL.md) | Apply deterministic ordered texture to graphics or backgrounds. |
| [video-shaders](.skills/video-shaders/SKILL.md) | Create deterministic Flutter shaders and capture their output. |
| [flutter-scene](.skills/flutter-scene/SKILL.md) | Render procedural or imported 3D geometry with Flutter Scene. |
| [git-sync](.skills/git-sync/SKILL.md) | Commit, rebase, push and verify synchronization on the current branch. |

## Set your video style

Use [video-style](.skills/video-style/SKILL.md) to define your direction through a
short interview and optional website, image or video references. It creates a
creator-owned folder with visual tokens, video rules, component recipes and
specimens for review. It can also refine an existing identity.

`components/` contains the `video_components` Flutter package. Styled widgets
require your own `VideoStyle`; the toolkit does not impose colors, fonts or
editorial presets. The CMRX colors on this README and documentation site style
those pages only.

Pin the toolkit as a Git submodule in a separate production workspace. Set
`CMRX_WORKSPACE` to your project root; optional `CMRX_COMPONENT_PACKAGE`,
`CMRX_COMPONENT_NAME` and `CMRX_TOKEN_CLASS` connect your own Flutter design package.

[Workspace integration →](https://chrismarxdev.github.io/cmrx-video-toolkit/guides/workspace/)

## Develop & contribute

Run `make test` from the repository root for the video tooling checks.
Read [development guidance](docs/DEVELOPMENT.md) and the relevant skill before editing.
Use synthetic examples and preserve source/output timing contracts.

For this Starlight documentation site (Node.js >=22.12):

```sh
npm --prefix docs ci
npm --prefix docs run dev
npm --prefix docs run build
```

GitHub Actions builds and publishes the docs to GitHub Pages on `main`. Reference
pages are generated from the existing app, component and pipeline documentation.

## License

Repository-authored software is [MIT licensed](LICENSE). Dependencies retain their
own licenses; see [THIRD_PARTY.md](THIRD_PARTY.md). No brand fonts, private recordings
or client materials are bundled.

Built by [Chris Marx Studio](https://cmrx.dev).
