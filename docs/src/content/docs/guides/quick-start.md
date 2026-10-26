---
title: Quick start
description: Install the skill collection and start a video with your agent, or explore individual tools.
---

## Install the skills

From your consuming project, install the collection for your agent. For Codex:

```sh
npx skills@latest add ChrisMarxDev/cmrx-video-toolkit --skill '*' --agent codex
```

Omit `--agent codex` to choose a host interactively. To inspect the collection
without installing it:

```sh
npx skills@latest add ChrisMarxDev/cmrx-video-toolkit --list
```

Install the full set for `edit-video`, which calls on other skills as needed.
Skill installation copies guidance and bundled resources. It does **not** install
Flutter, FFmpeg, models, the shared toolkit applications or MCP registrations.
Host skill discovery may need a refresh after installation.

## Ask for your first video

> Use edit-video to set up CMRX Video Toolkit and edit this recording. Help me
> define the visual style, let me review the cuts and preview the composition
> before exporting.

In Codex you can invoke `$edit-video` directly. Other hosts may use named skills
or slash commands. Supply the recording or its accessible path; if you already
have a toolkit checkout, tell the agent where it is.

The agent checks existing tools, locates or clones the toolkit, and prepares the
requirements for your task. Setup depends on the host’s permissions and installed
software; it may require a host refresh or a system prerequisite. Production
files belong in your own workspace, separate from the toolkit source.

The core experience is **edit → compose → review → refine → export**. You approve
creative choices and the final export. Revisions reuse your existing work.

## Browse instead of starting a full edit

The [skills & tools glossary](/cmrx-video-toolkit/reference/skills/) lists core
skills, editing stages, components, effects and framework support. You can define
a style, tune an animation or prepare a component as a focused task.

[Open the hosted component browser](/cmrx-video-toolkit/components/) to explore
widgets and their properties without installing the toolkit.

## Manual runtime setup

These commands are for people who want to manage setup themselves. Agent-assisted
setup follows the same underlying tooling requirements.

```sh
git clone https://github.com/ChrisMarxDev/cmrx-video-toolkit.git
cd cmrx-video-toolkit
python3 scripts/doctor.py
```

Install the prerequisites for the workflow you chose. Python and FFmpeg support
media processing and browser review. Composition and the local component browser
also use Flutter; the tested stack is Flutter 3.47.2 / Dart 3.13.2. New transcription
needs Whisper and a compatible model. MCP adapters require Node.js and a compatible
agent host. Fluvie live preview needs the documented compatible tooling.

See the [external requirements inventory](https://github.com/ChrisMarxDev/cmrx-video-toolkit/blob/main/docs/EXTERNAL-REQUIREMENTS.md)
for versions and platform-specific or optional requirements. Specialist native
capture paths have their own platform limits.

### Run the local component browser

After installing its Flutter, Python and FFmpeg prerequisites:

```sh
make components
```

Open `http://localhost:8090`. Stop this server before launching another app that
uses the same port. Components remain editable Flutter code; your agent can
integrate selected components into the video.

### Open a recording for review

After preparing the review editor’s requirements:

```sh
python3 apps/editor/server.py
```

See the [editor reference](/cmrx-video-toolkit/reference/editor/) for transcription,
workspace and feedback behavior. This opens the review tool; it does not start the
entire agent editing workflow. Preserve the original recording.

## Continue

[Follow the video workflow](/cmrx-video-toolkit/guides/workflow/) or
[connect your own workspace and style](/cmrx-video-toolkit/guides/workspace/).
For contributor setup and checks, use the repository’s `docs/DEVELOPMENT.md`.
