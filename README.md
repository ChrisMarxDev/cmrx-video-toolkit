![CMRX Video Toolkit — open tools and agent skills for programmable video](docs/public/readme-banner.svg)

<p align="center">
  <a href="https://chrismarxdev.github.io/cmrx-video-toolkit/">Documentation</a> ·
  <a href="https://chrismarxdev.github.io/cmrx-video-toolkit/guides/quick-start/">Quick start</a> ·
  <a href="https://chrismarxdev.github.io/cmrx-video-toolkit/components/">Component browser</a> ·
  <a href="https://cmrx.dev">Chris Marx Studio</a>
</p>

# CMRX Video Toolkit

A general-purpose blueprint for creating videos with AI: generate media, edit
recordings through a transcript, add captions and Flutter animations, and render
with FFmpeg. The toolkit includes a browser editor, reusable video
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
| [fal connector](tools/fal/) | Submit AI generation jobs and download media with provenance for composition. |
| [Dither tool](tools/dither/) | Explore local image/field dithering and export PNGs. |
| [Pipeline tools](scripts/) | Work with edit timelines, soundmaps, rendering and media checks. |
| [Agent skills](.skills/) | Give a coding agent instructions for editing, animation and review. |

## Get started

See the [external requirements inventory](docs/EXTERNAL-REQUIREMENTS.md) for the
minimum dependencies by workflow. Browser review does not need Flutter or Node;
the [MCP App / browser agent flow](apps/review-agent/README.md) adds agent handoff.

[Open the hosted component browser](https://chrismarxdev.github.io/cmrx-video-toolkit/components/)
to explore the public widgets without installing anything.

For the local component-browser build below, install **Python 3**, **FFmpeg/ffprobe** and
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

## Current dependencies

Building the app and components locally requires **Flutter**, which includes Dart
and Pub. The other tools below are required by specific parts of the current
implementation. See the [full inventory](docs/EXTERNAL-REQUIREMENTS.md) for package
versions, setup details and platform constraints.

| Dependency | Required for | Installation / scope |
| --- | --- | --- |
| Flutter SDK (includes Dart and Pub) | Building components, compositions and the component browser; current rendering workflow | Install Flutter; no separate Dart installation. |
| Fluvie package and CLI | Video compositions and pipeline preview/render commands | Restore the project Pub dependencies and install the `fluvie` CLI on PATH. |
| Python 3 | Review server, pipeline/media scripts and browser demo-media generation | Install Python; the review server requires 3.10+. |
| FFmpeg and ffprobe | Media inspection, audio extraction, cuts, encoding, exports and demo media | Install both executables on PATH. |
| Node.js and npm | Current MCP adapters, optional fal connector, JavaScript tests and documentation tooling | Node 22+ for MCP; 22.12+ for docs. Restore each adapter's locked npm packages. |
| whisper.cpp CLI and a compatible model | Generating new local transcripts | Install the recognizer; model lookup/download is automatic. Not required for an existing transcript. |
| Modern browser | Browser review and the component browser | Use an existing desktop browser. |
| Local MCP-capable agent host | Using the MCP adapters | Stdio support is required; inline UI additionally needs MCP Apps/local-origin support. |
| Target-specific native build tools/libraries | Building/capturing desktop apps and optional native Scene work | Install those required for the chosen platform; the native Scene capture path is currently macOS-specific. |
| NumPy, ONNX Runtime and RVM model | Optional person/background cutout | Separate Python environment and model, only for this feature. |
| Git and Make | Cloning/updating source and running the documented `make` targets | Make is a command wrapper; individual underlying commands can also be run directly. |

**Node is currently required for our MCP adapters and optional fal connector, not for Flutter itself.**
Ordinary browser review uses Python and FFmpeg without Node. Building the component
browser directly uses Flutter, Python and FFmpeg without Node. The full local
check suite also uses Node for JavaScript/MCP tests and the docs build.

No dependency replacement or migration has been decided. This list records what
we need today so future reductions can be evaluated separately.

## External service keys

Local editing, components and rendering do not require a cloud API key. Optional
connectors use credentials supplied by the consuming workspace or server.

| Service | Key | Used for | Setup |
| --- | --- | --- | --- |
| fal.ai | `FAL_KEY` | Optional image, video and audio generation; provider charges may apply | [fal connector](tools/fal/README.md#keys-and-setup) |

Store keys in a private environment file outside the checkout or a server secret
store. Do not include them in browser/Flutter builds, source control, prompts or
asset manifests. The hosted component browser has no credential storage or
secret-bearing backend. Model inputs and generated media are sent to/received from
the chosen provider; keep downloaded outputs in your production workspace.

## From recording to finished video

Generated assets can enter at storyboard/compose time through the optional fal
connector. Review and save them locally before rendering; video creation does not
require an original recording.

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
