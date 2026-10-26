![CMRX Video Toolkit — open tools and agent skills for programmable video](docs/public/readme-banner.svg)

https://github.com/user-attachments/assets/6d98bc32-6fe8-4e67-be9d-f546c4ff9c4d

<p align="center">
  <a href="https://chrismarxdev.github.io/cmrx-video-toolkit/">Documentation</a> ·
  <a href="https://chrismarxdev.github.io/cmrx-video-toolkit/guides/quick-start/">Quick start</a> ·
  <a href="https://chrismarxdev.github.io/cmrx-video-toolkit/components/">Component browser</a> ·
  <a href="https://cmrx.dev">Chris Marx Studio</a>
</p>

# CMRX Video Toolkit

An open-source video workspace for AI-assisted production: generate media, edit
recordings through a transcript, add captions and Flutter animations, and render
with FFmpeg. The toolkit includes a browser editor, reusable video
components and skills that guide a coding agent through each stage.

You review the cuts and visual plan before the agent builds the animation. Your
recordings stay on your machine; you supply the colors, fonts and editorial direction.

Python + FFmpeg + Flutter · MIT licensed

Powered by Flutter and [Fluvie](https://github.com/SimonErich/fluvie), with no
company-size licensing threshold for the toolkit or Fluvie. Optional generation
services, dependencies and media assets retain their own terms.

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

Start with [edit-video](.skills/edit-video/SKILL.md). Review the rough cut before
detailed animation in the live scene composition. `prepare-clips` creates reusable
footage clips with stable IDs; `adjust-clip` changes their original-source bounds.
See [clip metadata and commands](docs/contracts.md#addressable-footage-clips).
Map source cues through the edited timeline; do not guess
animation timestamps. Keep recordings, transcripts, models and renders outside Git.

The toolkit is in early development and runs locally. Use the browser editor to
review cuts and visual notes; compose the video in Flutter. Native Scene GPU
capture currently uses a separate macOS path. Check the rendered video before
publishing.

## Skill overview

Invoke **`$edit-video`** for the whole editing workflow or an existing video's
revision. Ingest, transcription, editing, storyboarding, composition and export
are progressively loaded references inside that skill, not separate commands.
Use the focused skills below for standalone work or optional specialist knowledge.
Tools and libraries remain shared; install/use the toolkit as one coherent bundle.

| Skill | Responsibility |
| --- | --- |
| [edit-video](.skills/edit-video/SKILL.md) | Coordinate editing, revisions and delivery. |
| [video-style](.skills/video-style/SKILL.md) | Define or revise a reusable visual identity. |
| [video-review](.skills/video-review/SKILL.md) | Collect human feedback through the review editor. |
| [component-select](.skills/component-select/SKILL.md) | Find and configure existing components. |
| [animation-workshop](.skills/animation-workshop/SKILL.md) | Generate a throwaway widget playground and copy tuned animation parameters. |
| [component-author](.skills/component-author/SKILL.md) | Create graphics and register reusable components. |
| [component-shaders](.skills/component-shaders/SKILL.md) | Author and integrate deterministic shaders. |
| [component-3d](.skills/component-3d/SKILL.md) | Capture native Flutter Scene geometry. |
| [component-dithering](.skills/component-dithering/SKILL.md) | Implement deterministic component dither textures. |
| [effect-background-remove](.skills/effect-background-remove/SKILL.md) | Create person cutouts from existing footage. |
| [fluvie-compose](.skills/fluvie-compose/SKILL.md) | Author framework-specific Fluvie compositions. |
| [fluvie-validate](.skills/fluvie-validate/SKILL.md) | Check composition errors and lint warnings. |
| [fluvie-render](.skills/fluvie-render/SKILL.md) | Preview, export and diagnose Fluvie rendering. |
| [fluvie-generative-ai](.skills/fluvie-generative-ai/SKILL.md) | Generate media or prompt-authored compositions. |

The `$name` notation is the Codex skill invocation; other hosts may expose slash
commands or named skills. No new shell executable is required. Host skill discovery
may need a refresh after upgrading. See [the skill map](docs/SKILLS.md) for ownership,
loading rules and migration from previous names.

## Install agent skills

Start with **`edit-video`** after installing the complete collection. It coordinates
the workspace and loads component, style, review and rendering guidance as needed.

Vercel's [skills CLI](https://github.com/vercel-labs/skills) discovers the public
skills directly from this repository. From your consuming project:

```sh
# Inspect the available skills without installing.
npx skills@latest add ChrisMarxDev/cmrx-video-toolkit --list

# Install the complete video skill set for Codex.
npx skills@latest add ChrisMarxDev/cmrx-video-toolkit --skill '*' --agent codex
```

Omit `--agent codex` to choose your agent interactively. Without `--skill '*'`,
the installer lets you select skills. Prefer the full set for `$edit-video`, which
routes to other skills. No npm publication or separate registry registration is
needed. See the [CLI reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md).

This installs instructions and bundled references/assets, **not** the toolkit
applications, Flutter libraries, FFmpeg, models or MCP registrations. Keep a toolkit
checkout and install the requirements for the selected workflow. Tell your agent
where that checkout is. `$edit-video` checks tooling readiness, reuses existing
installations and follows documented setup for missing requirements before editing.

The animation-workshop skill is self-contained: its disposable shell only needs
Flutter plus dependencies of the widgets you bring into it.

For a new workspace, install the skills in your consuming project, then ask your
agent: “Use $edit-video to set up CMRX Video Toolkit and create my first video.”
The agent can locate or clone the toolkit and prepare the requirements for your
chosen workflow. See the [quick start](https://chrismarxdev.github.io/cmrx-video-toolkit/guides/quick-start/)
for manual setup.

The [skills.sh collection](https://skills.sh/ChrisMarxDev/cmrx-video-toolkit) groups
skills into Video workflow, Components, and Fluvie & effects. Listings are populated
from CLI installations with telemetry enabled; discovery with `--list` alone is
not an installation. See [skills.sh's listing FAQ](https://skills.sh/docs/faq).

There is no new installer CLI. Skill command paths refer to the toolkit root, while video
outputs belong in your consuming workspace. Do not install over Studio's private
skill aliases; this command is for consuming projects.

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

### Live composition preview

[Validator](tools/validator/README.md) checks authored Dart with Fluvie’s analyzer
and lint rules before preview/export, without rendering.

[Previewer](tools/previewer/README.md) plays authored Fluvie compositions without
encoding a full video. Use `open_preview` / `get_preview` / `show_preview` / `close_preview` through
the existing edit/review MCP server, or its standalone Node entrypoint. The UI
contains only the player and playback/seeking controls. Requires the newer
Fluvie JSON web-preview API; original 0.3.1 installations need compatible tooling.
