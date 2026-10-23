# Previewer

A small local tool for playing an authored Fluvie composition before export.
The UI is Fluvie's fitted video canvas, play/pause, sound toggle and seek bar with
elapsed/duration, plus an optional read-only layer timeline when authored metadata
is supplied. No editor, annotations, transcript, component inspector, render
button or approval action. Give feedback in chat; render an export separately.

The same Dart `Video build()` and its project dependencies feed preview and
export. The tool starts Fluvie's web preview, watches its machine events and owns
its process lifetime. It does not translate the composition or encode an MP4.
Fluvie handles media preparation, on-demand proxy frames, audio mixing and source
reload. This saves full video encoding, not all computation or disk use: Flutter
build caches and temporary audio/media preparation still exist.

## Requirements

- Node 22+, Flutter/Dart matching the composition, system FFmpeg **and** FFprobe.
- A Fluvie CLI supporting `preview --device web-server --json --toolchain system
  --no-download`, with schema-1 `ready` / `reloaded` events.
- The composition's Fluvie dependency must expose `VideoPreview`, including its
  local-media decoder and audio adapters. The original published 0.3.1 package
  and CLI on some machines do **not** include these newer APIs.

The upstream implementation inspected for this adapter is
[Fluvie revision 10e442c1bb469118516df3335547f85ec92155e6](https://github.com/SimonErich/fluvie/tree/10e442c1bb469118516df3335547f85ec92155e6).
That revision has a generated-shell compile bug: `ProjectAssetBundle.fromProject`
is asynchronous but the template does not await it. Apply the bundled
[compatibility patch](patches/fluvie-preview-assets-await.patch) **to that upstream
checkout**, before running the preview. It adds the await and invalidates only
the generated preview-host stamp. From the upstream checkout:

```sh
git apply --check /absolute/toolkit/tools/previewer/patches/fluvie-preview-assets-await.patch
git apply /absolute/toolkit/tools/previewer/patches/fluvie-preview-assets-await.patch
```

Do not apply blindly to other revisions; a future upstream fix can replace it.
The adapter does not modify installed packages or production source automatically.
Check APIs, not just the `0.3.1` version label. Keep a compatible upstream checkout
outside your video project and toolkit. Run `flutter pub get` in that checkout;
a small local executable can forward arguments to
`dart /absolute/fluvie/packages/fluvie_cli/bin/fluvie.dart "$@"`.
Set `FLUVIE_PREVIEW_BIN` to that executable (a path, not a shell command).
For preview audio, include `flutter_test: {sdk: flutter}` in the composition
project’s dev dependencies and run `flutter pub get`; upstream builds its audio
mix through Flutter’s test harness and needs the SDK-pinned test API.
The composition must also resolve compatible Fluvie packages from the same
revision, using project-local dependency overrides when needed. Resolve the
composition's dependencies before previewing. Preserve its existing lockfile and
working export route; do not silently upgrade all toolkit packages.

This tool neither installs dependencies nor downloads managed FFmpeg. A missing
or incompatible runtime returns a failed session with setup diagnostics. The
`edit-video` skill can handle setup using the project's actual pins.

## Through the existing edit/review MCP server

Restart `apps/review-agent/mcp.mjs --root /absolute/video-workspaces` after updating.
Private adapters using its `main()` inherit the preview tools as well.

1. `open_preview(path: "project/lib/video.dart", project: "project")` returns a
   session ID immediately. Both paths resolve under the server's configured root.
   `entry` optionally selects a different top-level factory.
2. Poll `get_preview(sessionId: ...)` while `status` is `starting`. On `ready`,
   call `show_preview` once to present its MCP player, or use `browserUrl`.
   Status polling does not open UI panels. Startup includes first-time compilation.
3. Edit the original composition. Fluvie rebuilds/reloads automatically; the
   session counts successful reload events. Pubspec/dependency changes may require
   closing and reopening. A failed rebuild must be fixed before reviewing again.
4. `close_preview(sessionId: ...)` stops its process tree. Server shutdown closes
   owned previews. Reopening an active composition reuses its session.

There is at most one active preview per project because upstream caches its host
per project. Close it before selecting another entry or composition. Up to three
projects may run concurrently. Preview runs trusted Dart code; path scoping is
not a sandbox for that code or its dependencies.

Inline display uses a local Flutter iframe and requires host support for the
returned `frameDomains` CSP and loopback access. The resource must be fetched
once the session is ready to receive its actual origin. Hosts caching an older
resource/CSP may need a fresh app opening. Remote/cloud hosts cannot reach your
loopback service; use the returned URL in a local browser. No public tunnel,
automatic browser launch, or host config changes are made. Playback continues
without agent-turn tool calls. Closing the UI does not imply approval or stop
the server session; use `close_preview` to release it.

## Standalone

From the toolkit checkout:

```sh
node tools/previewer/serve.mjs /absolute/video-workspaces project project/lib/video.dart
```

The script prints JSON state changes and the browser URL; Ctrl-C shuts it down.
It is a small tool entrypoint, not a toolkit installer/CLI. It needs no npm install.

## Limits and checks

Browser support is determined by the composition: native-only 3D/Impeller,
`dart:io` authoring, shaders, generated assets and fonts need explicit compatible
paths. Never substitute an encoded render while calling it a live preview.
Preview is not final encoded-output QA. Browser sound requires a human gesture.
The upstream player starts visual playback when prepared; its sound toggle
activates audio. Frame decode or audio failures must be surfaced, not accepted as
successful media review.

```sh
node --test tools/previewer/*.test.mjs
npm --prefix apps/review-agent test
```

Protocol tests cover readiness, reuse, reload events, failures, shutdown, scoped
paths, URL/CSP restrictions and independent MCP tools. Real browser acceptance
is a separate check, including actual clips/audio and seeking after source edits.

## Optional layer timeline

`flutter/` is the `composition_previewer` Flutter package. Add it as a path
dependency to a **preview host**, and import
`package:composition_previewer/preview_layers.dart`.

Wrap the **player**, outside its composition canvas, in `PreviewLayers`. It places
a Layers toggle below the player. The timeline is collapsed initially; expanding
it reserves space below the picture rather than obscuring or changing the canvas.
Rows show authored time spans, a shared playhead and a ruler. Click a row or ruler
to seek; assistive increase/decrease actions seek by one second. There are no
trim handles, dragging, visibility toggles or editing actions. Longer lists scroll.

```dart
ValueListenableBuilder<int>(
  valueListenable: playback.frames,
  builder: (context, frame, player) => PreviewLayers(
    seconds: frame / video.fps,
    duration: video.totalFrames / video.fps,
    layers: const [
      PreviewLayer(name: 'Camera', spans: [PreviewSpan(0, 10)]),
      PreviewLayer(name: 'Captions', spans: [PreviewSpan(1, 3), PreviewSpan(6, 8)]),
    ],
    onSeek: (seconds) => playback.seek(
      (seconds * video.fps).round().clamp(0, video.totalFrames - 1)),
    child: player!,
  ),
  child: VideoPreview.builder(controller: playback, builder: buildVideo),
)
```

The Fluvie host owns/disposes its playback controller and supplies its existing
media/audio adapters to VideoPreview. Reuse the same controller for the player
and timeline; do not create a second clock. Derive full `PreviewSpan(start, end)`
intervals from the composition's timing in **output seconds**, not source time.
Intervals are half-open; metadata must be recomputed after timing edits. Supply
layers in front-to-back order, with optional `detail` (shown on hover). Audio may
be a separate named row; its bar declares the track, not whether sound is muted.

This replaces the earlier `active`/`uiScale` list-overlay API. It does not infer
layers by inspecting widgets. Empty metadata is labelled. The shell belongs in
the preview host only, never the export entrypoint. Upstream's default generated
host needs this explicit integration; a custom host must be retained/reapplied if
its generated cache is rebuilt.

Validate with `flutter pub get`, `flutter analyze` and `flutter test` in `flutter/`.
