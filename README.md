![CMRX Video Toolkit — agent skills, editing tools and reusable video components](docs/public/readme-banner.svg)

# CMRX Video Toolkit

A collection of agent skills, tools and reusable components for creating and
editing videos. Start with **`edit-video`** for the complete editing experience,
or pick a skill for visual style, animation, 3D, effects or a specific task.

Your agent works with footage, transcripts and editable Flutter scenes. You review
the cuts and visuals, request changes and approve the export. Bring your own colors,
fonts and editorial direction.

[Start editing](#start-editing) · [Browse the glossary](#skills--tools-glossary) ·
[Documentation](https://chrismarxdev.github.io/cmrx-video-toolkit/) ·
[Try the component browser](https://chrismarxdev.github.io/cmrx-video-toolkit/components/)

https://github.com/user-attachments/assets/6d98bc32-6fe8-4e67-be9d-f546c4ff9c4d

## The core editing experience

**Bring footage or assets → shape the edit → compose scenes → review live → export.**

[`edit-video`](.skills/edit-video/SKILL.md) coordinates the process and loads the
skills and stage references needed for your project. Revisions resume from existing
work rather than repeating every stage. Footage, captions, graphics and sound stay
together in an editable composition; you review it before the final render.

The collection also works beyond a full edit: define a video style, explore a
component, tune an animation or prepare a specialist effect on its own.

## Start editing


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
routes to other skills. See the [CLI reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md)
for installer options.

This installs instructions and bundled references/assets, **not** the toolkit
applications, Flutter libraries, FFmpeg, models or MCP registrations. Keep a toolkit
checkout and install the requirements for the selected workflow. Tell your agent
where that checkout is. `$edit-video` checks tooling readiness, reuses existing
installations and follows documented setup for missing requirements before editing.

For a new workspace, install the skills in your consuming project, then ask your
agent: “Use $edit-video to set up CMRX Video Toolkit and create my first video.”
The agent can locate or clone the toolkit and prepare the requirements for your
chosen workflow. See the [quick start](https://chrismarxdev.github.io/cmrx-video-toolkit/guides/quick-start/)
for manual setup.

## Things to ask your agent

- “Use edit-video to tighten this recording. Let me review the cuts before adding graphics.”
- “Use video-style to define a consistent look for my videos.”
- “Find a component that explains these three steps and add it to this scene.”
- “Use animation-workshop to make this transition feel calmer.”
- “Revise the closing scene, keeping the narration and the rest of the video intact.”

`$edit-video` is Codex’s invocation syntax; other hosts may expose named skills or
slash commands. You can also describe the task in ordinary language. Skills guide
a capable agent; the review editor and live preview provide the visual feedback.

## Skills & tools glossary

Browse the collection when you need one particular capability. A **skill** guides
an agent; a **workflow stage** is a reference inside `edit-video`; a **tool** or
**library** provides the software those instructions use. Most skills share the
toolkit runtime. Installing a skill alone does not install its dependencies.

### Core editing, style and review

| Entry | Type | When it’s useful |
| --- | --- | --- |
| [edit-video](.skills/edit-video/SKILL.md) | Core skill | Create or revise a video, coordinating the workflow from source material to reviewed export. |
| [video-style](.skills/video-style/SKILL.md) | Skill | Define or refine your colors, typography, framing, motion and editorial rules. |
| [video-review](.skills/video-review/SKILL.md) | Skill | Review cuts and visuals, collect timed feedback and return it to the agent. |

### Editing subskills / workflow stages

These are progressively loaded parts of `edit-video`, not separately installed or
invoked skills. The agent enters at the stage your project needs.

| Stage | When it’s useful |
| --- | --- |
| [Ingest](.skills/edit-video/references/ingest.md) | Bring source media into a working project and inspect it. |
| [Transcribe](.skills/edit-video/references/transcribe.md) | Generate or correct the transcript used for editing. |
| [Edit](.skills/edit-video/references/edit.md) | Choose takes and cuts while preserving source-to-output timing. |
| [Storyboard](.skills/edit-video/references/storyboard.md) | Decide what the viewer should see alongside the narration. |
| [Compose](.skills/edit-video/references/compose.md) | Assemble footage, captions, graphics and sound into editable scenes. |
| [Render & delivery](.skills/edit-video/references/render.md) | Export the approved composition and check the resulting media. |

### Components & animation

| Skill | When it’s useful |
| --- | --- |
| [component-select](.skills/component-select/SKILL.md) | Find an existing component and choose its variant and properties. |
| [component-author](.skills/component-author/SKILL.md) | Create a graphic or register a reusable component. |
| [animation-workshop](.skills/animation-workshop/SKILL.md) | Tune a few widgets in a disposable Flutter playground, then copy the settings back. |
| [component-shaders](.skills/component-shaders/SKILL.md) | Build deterministic shader effects for video. |
| [component-dithering](.skills/component-dithering/SKILL.md) | Add ordered texture to components or backgrounds. |
| [component-3d](.skills/component-3d/SKILL.md) | Render geometry through native Flutter Scene capture. |

### Specialist workflows

| Skill | When it’s useful |
| --- | --- |
| [effect-background-remove](.skills/effect-background-remove/SKILL.md) | Turn existing footage of a person into an alpha cutout for composition. |
| [meshy-scene](.skills/meshy-scene/SKILL.md) | Prepare Meshy models, rigs and motion clips for an isolated Flutter Scene workflow. |
| [fluvie-generative-ai](.skills/fluvie-generative-ai/SKILL.md) | Generate media or a prompt-authored composition when generation is requested. |

### Framework support

| Skill | When it’s useful |
| --- | --- |
| [fluvie-compose](.skills/fluvie-compose/SKILL.md) | Work with Fluvie’s scene, timing, media and widget APIs. |
| [fluvie-validate](.skills/fluvie-validate/SKILL.md) | Check authored compositions for analyzer errors and lint warnings. |
| [fluvie-render](.skills/fluvie-render/SKILL.md) | Preview, export or diagnose a Fluvie composition. |

### Supporting tools & libraries

| Entry | Type | When it’s useful |
| --- | --- | --- |
| [Review / transcript editor](apps/editor/) | Tool | Inspect source material, mark keep/cut ranges and add timed visual notes. |
| [Review agent adapter](apps/review-agent/) | MCP adapter | Open review from an agent host and return feedback. |
| [Component browser](tools/component_browser/) | Tool | Inspect real Flutter widgets, properties, variants and motion. |
| [Component agent adapter](apps/component-browser-agent/) | MCP adapter | Discover components and open the browser from an agent host. |
| [Video components](components/) | Flutter library | Reuse widgets, shaders, media and motion with your own styling. |
| [Live previewer](tools/previewer/) | Tool | Play an authored composition before encoding a full video. |
| [Composition validator](tools/validator/) | Tool | Run static composition checks before preview or export. |
| [Pipeline](scripts/) / [media tools](video_tools/) | CLI tools | Prepare clips, map timelines, transform media and check outputs. |
| [Dither tool](tools/dither/) | Tool | Explore image/field dithering and export PNGs. |
| [fal connector](tools/fal/) | Optional connector | Generate media through fal.ai and download it with provenance. |

The animation workshop carries its own disposable template; it still needs Flutter
and the dependencies of the widgets you bring. Other specialist workflows have
their own requirements and platform limits. See the [skill map](docs/SKILLS.md)
for loading rules and the [requirements inventory](docs/EXTERNAL-REQUIREMENTS.md)
for setup by capability.

## Setup & requirements

The toolkit runs locally and is in early development. Skills, executable tools and
optional services have separate setup requirements; install only what your task
uses. Your agent can prepare the workspace, or follow the [manual quick start](https://chrismarxdev.github.io/cmrx-video-toolkit/guides/quick-start/).

- **Review:** Python and FFmpeg; transcription additionally needs Whisper and a model.
- **Composition and components:** Flutter/Dart and compatible Fluvie tooling, plus media prerequisites.
- **MCP integration:** Node.js and a compatible local agent host; inline UI depends on host support.
- **Specialist workflows:** additional models, native tools or service credentials only when used.

See [external requirements](docs/EXTERNAL-REQUIREMENTS.md) for versions, platform
limits and the complete inventory. [Live preview setup](tools/previewer/README.md)
documents the compatible Fluvie API and prerequisites. Skill installation does not
register MCP servers or install these runtimes.

Local media editing and rendering do not require a generation-service key. Your
chosen AI agent may use a remote model; optional generation sends inputs to its
provider. The [fal connector](tools/fal/README.md#keys-and-setup) uses `FAL_KEY` and
may incur provider charges. Keep credentials outside source control and browser
builds. Store recordings, transcripts, models and renders outside Git.

## Make it your own

[`video-style`](.skills/video-style/SKILL.md) turns your direction and references
into a creator-owned style folder with tokens, video rules and component recipes.
The `video_components` library uses your `VideoStyle`; it does not impose CMRX
colors, fonts or editorial presets. The branding here belongs to the toolkit’s
presentation, not your finished video.

Keep production in a separate workspace and pin the toolkit when reproducibility
matters. [Workspace integration](https://chrismarxdev.github.io/cmrx-video-toolkit/guides/workspace/)
covers paths and connecting your own Flutter design package.

## Develop & contribute

Read [development guidance](docs/DEVELOPMENT.md) and the relevant skill. Use
synthetic examples and preserve the source/output timing contracts.

```sh
make test
npm --prefix docs ci
npm --prefix docs run build
```

The docs require Node.js 22.12+. Use `npm --prefix docs run dev` for local preview.
GitHub Actions builds and publishes the documentation on `main`.

## License

Repository-authored software is [MIT licensed](LICENSE), including use in
commercial projects. Powered by Flutter and [Fluvie](https://github.com/SimonErich/fluvie).
Dependencies, optional services and media assets retain their own terms; see
[THIRD_PARTY.md](THIRD_PARTY.md). No private recordings or client materials are bundled.

Built by [Chris Marx Studio](https://cmrx.dev).
