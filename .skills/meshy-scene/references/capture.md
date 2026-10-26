# Isolated Flutter capture

The local handoff is a self-contained GLB. No API key is needed for this path.
The capture scaffold uses runtime GLB import; no Meshy package or Scene asset
conversion hook is installed into the user's existing app. Its Flutter dependencies
are resolved only inside the new disposable project.

```sh
python3 /path/to/meshy-scene/scripts/scene_capture.py inspect /assets/character.glb
python3 /path/to/meshy-scene/scripts/scene_capture.py scaffold --model /assets/character.glb --output /tmp/character-capture --platform macos
cd /tmp/character-capture
flutter pub get
flutter analyze
flutter build macos --debug --dart-define=CLIP=0
SCENE_OUTPUT=/tmp/character-frames build/macos/Build/Products/Debug/meshy_capture.app/Contents/MacOS/meshy_capture
```

On Linux scaffold with `--platform linux`, then use:

```sh
flutter build linux --debug --dart-define=CLIP=0
SCENE_OUTPUT=/tmp/character-frames build/linux/x64/debug/bundle/meshy_capture
```

Use the matching architecture's bundle path on non-x64 hosts. The scaffold enables
Flutter GPU only in the disposable runner. Native backend availability depends
on the host; do not silently switch to a software 2D renderer. This template passed
native Linux capture on Flutter 3.47.7 with a synthetic skinned, animated GLB:
the midpoint moved and the loop-end pixels matched the initial pose. Alpha-capable
ProRes encode/decode also passed. macOS follows the existing native capture pattern
but this new template still needs a macOS check. Real Meshy output and complex rigs
remain separate validation; no paid jobs were run to test the bundle.
The native executable may display a short-lived window, captures and exits. Prefer
the built executable: `flutter run` can linger after this short-lived app exits
before its debug connection finishes. Check process status and `complete.json`.
No completion file means an incomplete render.

On macOS the scaffold enables Flutter GPU in its own Info.plist but preserves the
generated app sandbox. If the app cannot write to the chosen output, select a
writable directory inside its app container, or explicitly adjust only this
disposable capture app's sandbox entitlements. Do not alter machine-wide settings.

## Parameters and animation

Parameters are `--dart-define=NAME=value` on the build command. `SCENE_OUTPUT` is
the one runtime environment override, so a built app can capture to a fresh folder
without rebuilding:

- `OUTPUT`: required absolute new directory; existing output is refused.
- `WIDTH`, `HEIGHT`: 720 × 1280 by default.
- `FPS`, `FRAMES`: 30 and 90 by default; duration is `FRAMES / FPS`.
- `CLIP`: imported animation index, `-1` for static (default). Inspect the GLB's
  inventory first; runtime also prints imported clip names/indices and durations.
- `LOOP`: true by default. False holds the last pose when the clip ends.
- `SPEED`: nonnegative animation time multiplier, default 1; 0 holds the first pose.
- `SCALE`: model scale, default 1. Meshy rig height is in meters.
- `CAMERA_DISTANCE`, `TARGET_Y`: default 4 and 0.9 meters; adjust to frame the model.
- `ORBIT`: camera orbit radians per second, default 0. Works without a rig.
- `TRANSPARENT`: true by default; false draws an opaque neutral background.

Start with a few small frames (e.g. `FRAMES=3 FPS=2 WIDTH=256 HEIGHT=256`) and inspect
them before a full capture. Use a fresh output directory for every run. Root motion
may take the character out of frame; edit the clip in Blender or animate the
placement/camera in the disposable copy. Do not assume every walk is in-place.

The template pauses its imported clip, seeks from absolute frame time and calls
`scene.update(0)` to apply the pose without advancing it again. Model placement is
on a separate parent node, preserving authored transforms. Geometry, camera and
clip time are deterministic; pixel identity across GPU/driver versions is not
promised. Record the generated pubspec.lock and SDK version with the asset job.

For custom clip transitions, create two clips on the same model, pause both, seek
both from absolute time, set complementary weights, then update once. Blender
constraints/IK should be baked to supported glTF animation channels. Rig repair,
retargeting, facial authoring and physics simulation are not implemented here.

## Encode and hand off

```sh
python3 /path/to/meshy-scene/scripts/scene_capture.py encode --frames /tmp/character-frames --output /tmp/character.mov
```

Encoding requires the exact completed PNG sequence and writes ProRes 4444 MOV.
This preserves alpha where frames contain it; an ordinary H.264 MP4 would not.
Inspect the output over a contrasting background and verify duration, orientation,
texture appearance and movement. Retain PNGs if the downstream renderer handles
them better than ProRes. Confirm actual downstream alpha decoding before promising
an overlay; Flutter video playback and export paths may differ.

Pass model-manifest.json, complete.json, the GLB or rendered segment, asset origin
and license, output offset and audio policy to composition. This template is silent.
It does not change Fluvie, the editor or a component catalog. Direct GPU rendering
inside a headless video exporter remains a separate integration test.

Sources: [Flutter Scene 0.24.3](https://pub.dev/packages/flutter_scene/versions/0.24.3),
[upstream source](https://github.com/bdero/flutter_scene),
[animation seeking](https://fscene.dev/api/flutter_scene/0.22.1/scene/AnimationClip/playbackTime).
