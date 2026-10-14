---
title: Your workspace & style
description: Keep reusable software separate from your recordings, brand and production work.
---

Pin the toolkit to a reviewed Git commit or release in your own workspace. Keep
recordings, transcripts, generated previews, models and exports outside Git.
Do not commit private knowledge or client materials to the public toolkit.

## Bring your own appearance

The Flutter package is `video_components`, located in `components/`. Styled widgets
require a caller-owned `VideoStyle`: supply colors and typography from your own
application. The component browser's grayscale demo style is only an example.

The purple, lavender and lime on this documentation website are CMRX's **website
identity**, not defaults applied to your videos.

Read the [component catalog](/cmrx-video-toolkit/reference/components/) for the
current styling contract and migration guidance.

## Connect the pipeline

Set `CMRX_WORKSPACE` to your private project root when invoking `scripts/video.py`.
The following optional environment variables select your Flutter design package
for generated baseline compositions:

- `CMRX_COMPONENT_PACKAGE`: path to the package.
- `CMRX_COMPONENT_NAME`: Dart package name.
- `CMRX_TOKEN_CLASS`: your token class used by baseline composition generation.

Keep that package, its fonts and your editorial instructions in the consuming
workspace. Inspect generated compositions before rendering.

## Extend the component browser

The catalog metadata, specimen builder and constructor examples must agree.
Metadata alone cannot load arbitrary Dart implementations. Private component
registries currently need a compile-time integration app.
