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

**Flutter/Dart is the required development baseline.** We build the app and new
components locally. The goal is to minimize additional SDKs, runtimes and tools
installed alongside Flutter, while keeping that authoring/build workflow intact.
The [full inventory](docs/EXTERNAL-REQUIREMENTS.md) owns exact versions, workflow
requirements and validation evidence; keep this summary in sync with it.

| Dependency | Needed today for | Keep or reduce |
| --- | --- | --- |
| Flutter SDK, including Dart and Pub | Building components, compositions and the browser; current rendering workflow | Keep as the core toolchain. Use its included Dart tooling for supporting commands where practical. |
| Fluvie package and CLI | Composition playback/capture and pipeline preview/render commands | Keep the rendering dependency; automate pinned CLI setup through the existing Dart toolchain. |
| Python 3 | Review engine, pipeline/media scripts and synthetic browser media generation | Candidate for removal by porting these operations to Dart incrementally. |
| Node.js + npm packages | Local MCP adapters; docs development and JavaScript tests | Candidate for removal from the video development workflow through a Dart MCP service; isolate docs tooling. |
| FFmpeg / ffprobe | Media inspection, audio extraction, cuts, encoding and exports | Retain media capabilities; automate compatible binary setup rather than introduce another runtime. |
| whisper.cpp + model | New local transcription; not needed with an existing transcript | Keep optional; automate recognizer setup. Shared model lookup/download already exists. |
| Browser / MCP host | Browser review/previews and agent integration | Use existing applications; keep host requirements separate from build tooling. |
| Native platform build tools and libraries | Desktop compilation/capture; optional native Scene path | Keep only those required by the chosen target; avoid installing toolchains for unused platforms. |
| NumPy, ONNX Runtime + RVM model | Optional person/background cutout | Keep isolated; evaluate a Dart/native integration to avoid a separate Python environment. |
| Git, Make and development packages | Source setup, checks, docs and contribution | Keep Git for source work; consider Dart task commands to remove Make/shell helpers as extra prerequisites. |

Dart orchestration and MCP implementations are candidates for reducing Python and
Node installations. They are not implemented replacements yet. Flutter alone does
not replace video codecs or speech recognition: track native helpers separately
from general-purpose development runtimes. Prebuilt app distribution is outside
this reduction roadmap; the local Flutter build remains part of the workflow.

Track each reduction separately; the items below are planned, not shipped:

- [ ] Add a workflow-specific dependency check/setup command using the installed Dart toolchain; distinguish core, target-specific and optional tools.
- [ ] Automate pinned Fluvie CLI and FFmpeg/ffprobe setup, with supported-platform and license checks.
- [ ] Prototype a Dart MCP service against the existing catalog and review contracts; remove Node from the video workflow only after parity checks.
- [ ] Port Python orchestration and demo-media generation to Dart incrementally, preserving timing, review receipts, media handling and failures.
- [ ] Replace Make/shell entrypoints with Dart commands where practical and keep docs/test-only tooling separate from video authoring requirements.
- [ ] Automate optional recognition/cutout setup without adding those dependencies to every installation.
- [ ] Verify the complete edit/build/render/MCP workflow on clean supported machines with Flutter installed, recording every additional tool still needed.

For each checked item, record the release/commit, affected workflow, installations
removed, remaining prerequisites and clean-machine evidence in the full inventory.
Automatically installing a binary reduces setup work; eliminating a runtime
reduces the toolchain itself. Track both without conflating them.

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
