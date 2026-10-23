# Tested native capture path

The headless `flutter test --enable-flutter-gpu` probe failed because its backend
was not Impeller. A dedicated native macOS app successfully captured GPU frames.
Do not hide this by swapping in a 2D approximation and calling it Flutter Scene.

1. Create a local project with `flutter create --platforms=macos`, add
   `flutter_scene: 0.24.3` and `vector_math`, then run
   `dart run flutter_scene:init --no-skills`. The package contains its own skills.
2. Put `../assets/capture.dart` at the app's `lib/main.dart`. Set output using
   `SCENE_OUTPUT` in the process environment. The sample is 720×1280, 30fps, 8s.
3. Enable Flutter GPU: add `FLTEnableFlutterGPU` = true to the macOS Runner Info.plist.
   Give this local render app access to its output directory. The tested experiment
   disabled its own app sandbox entitlements; don't alter global machine settings.
4. `flutter build macos --debug`, then run the generated app executable via CLI with
   `SCENE_OUTPUT=/absolute/project/renders`. A blank app window can briefly appear.
   It preloads resources, writes frames directly from Scene.render, and exits.
   Set `SCENE_FRAMES=1` for a one-frame smoke check; omit it for all 240 frames.
5. Encode after successful completion and exact raw byte-count verification:

```sh
ffmpeg -v error -y -f rawvideo -pixel_format rgba -video_size 720x1280 \
  -framerate 30 -i renders/frames.rgba -frames:v 240 -c:v libx264 \
  -preset slow -crf 17 -pix_fmt yuv420p -movflags +faststart renders/scene.mp4
```

240 × 720 × 1280 × 4 bytes are expected. A silent study intentionally has no audio;
keep narration singular when adding it to a video. Render RGBA/alpha-capable output
if an overlay needs transparency; this sample deliberately paints an opaque base.
Do not assume a shader's transparent background implies the MP4 has alpha.

Local proven example: `projects/scene-motion/` (ignored). The checked-in capture
source is portable via its output environment variable, unlike the original local
prototype. Verify backend availability on other platforms before promising support.

Sources: [package](https://pub.dev/packages/flutter_scene),
[assets](https://fscene.dev/guides/assets-and-loading/),
[animation](https://fscene.dev/guides/animation/). Checked 2026-10-13.

If an incremental macOS build reports a Runner/Flutter Assemble dependency cycle
and FlutterInputs.xcfilelist includes generated build directories, run
`flutter clean`, `flutter pub get`, then rebuild. This cleared the observed Xcode
27 cache cycle; deleting only build/macos did not. Do not patch generated file lists.
