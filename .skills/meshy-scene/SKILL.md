---
name: meshy-scene
description: Prepare Meshy 3D models, rigs and motion clips for Flutter Scene videos, using an isolated asset workflow and deterministic frame capture. Use for Meshy-to-Flutter work, not general video editing or procedural 3D.
---

# Meshy to Flutter Scene

Produce a reusable GLB and, when requested, a captured 3D segment for the user's
video. This directory carries all its helpers. It needs no editor, toolkit service,
component registration, other skill installation or pipeline change.

Keep requests, receipts, downloaded models and capture projects in a user-owned
asset workspace outside Git. Never edit installed templates for a production job.
The Python helpers require Python 3.11+; capture additionally needs Flutter 3.47.1+
with a native GPU backend. FFmpeg is only needed for encoding frames.

## Choose the entry point

- **Existing GLB:** skip Meshy entirely. Inspect it and follow
  [capture](references/capture.md). Rotating a product or moving a camera needs
  no skeleton; use the static model and animate its placement or camera.
- **Generate, rig or add motion:** follow [Meshy tasks](references/meshy.md).
  Reuse completed assets and task IDs. Creation is paid; execute only the
  generation requested by the user. Creating/installing this skill is not a
  request to run live jobs. Read credentials from `MESHY_API_KEY`, never a command
  argument or checked-in file. MCP tools may be used if present; do not submit the
  same job through both MCP and the helper.
- **Custom acting, facial motion or unusual anatomy:** author/repair the rig in
  Blender, bake constraints/IK into bone keyframes and export a self-contained GLB.
  Flutter Scene plays imported animation; it does not auto-rig or retarget it.

For characters prefer a textured humanoid in A/T-pose with separated limbs. Meshy
web-app rig options and API options differ; the bundled API route supports
humanoids. Smart Rig's existence does not imply preset-animation compatibility.
Inspect deformation before committing to a character. Facial expressions need
appropriate authored bones/morph targets, not merely a body rig.

## Asset and rendering contract

Use GLB with embedded textures, skin and the desired clips. The inspector reports
clip indices/names, skin count and required extensions; it is not a full glTF
validator. Empty clip lists, unsupported extensions, missing textures and poor
deformation require resolution before capture. Preserve the model hash, origin,
generation request/IDs and applicable asset license in the local workspace.

The bundled capture app pins Flutter Scene 0.24.3, uses a paused clip sampled at
`frame / fps`, and writes PNGs plus completion metadata. It can capture static
assets or one clip per segment. For transitions adapt the disposable Dart copy
with explicit clip weights and absolute sampling. Never substitute wall-clock
playback or claim a static pose is an animated result.

Check first/middle/last frames for framing, textures, limb deformation, root motion,
shadows and transparency. A successful analyzer/build is not visual acceptance.
Encode only complete sequences. Hand the GLB or rendered segment to the composing
agent with FPS, duration, local time zero, intended output offset and alpha status.
Integration into a video remains a separate explicit composition action; this
skill does not modify existing compositions. Headless Fluvie GPU parity is unproven.

## Local checks

From a toolkit checkout: `make meshy-scene-test`. From a separately installed skill:
`python3 -m unittest discover -s /path/to/meshy-scene/tests -v`.
These checks use synthetic GLB data and mocked HTTP, never paid jobs. Validate the
generated app with `flutter analyze` and actual native capture on the target host.
