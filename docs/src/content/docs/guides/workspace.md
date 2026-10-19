---
title: Your workspace & style
description: Keep reusable software separate from your recordings, brand and production work.
---

Pin the toolkit to a reviewed Git commit or release in your own workspace. Keep
recordings, transcripts, generated previews, models and exports outside Git.
Do not commit private knowledge or client materials to the public toolkit.

## Set colors and typography

The Flutter package is `video_components`, located in `components/`. Styled widgets
require a `VideoStyle` supplied by your application, with your colors and
typography. The component browser's grayscale demo style is only an example.

Set these values in your workspace; the toolkit does not apply the documentation
site’s colors to your videos.

Read the [component catalog](/cmrx-video-toolkit/reference/components/) for the
current styling contract and migration guidance.

## Connect the pipeline

Set `CMRX_WORKSPACE` to your private project root when invoking `scripts/video.py`.
Set `CMRX_VIDEO_DIR` to choose the production folder beneath that root (default:
`projects`). For example, `CMRX_VIDEO_DIR=videos` creates new workspaces in
`<workspace>/videos/<name>/`.
The following optional environment variables select your Flutter design package
for generated baseline compositions:

- `CMRX_COMPONENT_PACKAGE`: path to the package.
- `CMRX_COMPONENT_NAME`: Dart package name.
- `CMRX_TOKEN_CLASS`: your token class used by baseline composition generation.

Keep that package, its fonts and your editorial instructions in the consuming
workspace. Inspect generated compositions before rendering.

## Extend the component browser

The catalog metadata, specimen builder and constructor examples must agree.
To preview your own Dart components, register their implementations in a Flutter
app and compile it. Adding a catalog entry alone does not load the widget.
