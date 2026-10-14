---
title: Quick start
description: Clone the toolkit, check prerequisites and open the component browser.
---

## Install the prerequisites

The video tools use **Python 3**, **FFmpeg/ffprobe** and **Flutter**. The tested
Flutter stack is 3.47.2 / Dart 3.13.2; each package pins its dependencies. The
review editor runs locally in a browser on Linux, macOS and Windows; native Scene
capture still has macOS-specific paths.
Whisper and its transcription model are separate installs; neither is bundled.

```sh
git clone https://github.com/ChrisMarxDev/cmrx-video-toolkit.git
cd cmrx-video-toolkit
python3 scripts/doctor.py
```

Address missing prerequisites reported by the doctor before using that capability.
You do not need Node.js to use the Python/Flutter tools; Node >=22.12 is for this
documentation site.

## Explore the components

```sh
make components
```

Open `http://localhost:8090`. The browser renders the actual Flutter widgets and
lets you explore props, variants and motion. It is a component workbench, not a
video compositor. Stop it before launching another app on the same port.

## Open a recording in the editor

From the repository root, after setting up the editor's transcription prerequisites:

```sh
python3 apps/editor/server.py
```

See the [editor reference](/cmrx-video-toolkit/reference/editor/) for the
workspace, Whisper model requirements and export behavior. Keep originals immutable.

## Check the toolkit

```sh
make test
```

Run this from the repository root. It exercises the Python pipeline, dithering,
Flutter components, gallery, browser and editor using synthetic fixtures.

Next: [follow the video workflow](/cmrx-video-toolkit/guides/workflow/).
