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

The same revision waits for cold audio preparation before starting visual
playback. Apply [the playback patch](patches/fluvie-preview-playback.patch) to
start the picture immediately and show “Preparing audio” on the sound control.
Audio joins at the current position when ready; pausing during preparation stays
paused. Audio failure does not prevent visual playback. This changes cold-start
behavior: initial pictures can play silently while the audio mix is prepared.

```sh
git apply --check /absolute/toolkit/tools/previewer/patches/fluvie-preview-playback.patch
git apply /absolute/toolkit/tools/previewer/patches/fluvie-preview-playback.patch
# From packages/fluvie:
flutter test test/rendering/runtime/video_preview_test.dart test/rendering/runtime/preview_pending_audio_test.dart
```

Declared project shaders also need linking into the generated preview host.
Apply [the shader patch](patches/fluvie-preview-shaders.patch) after the await patch:

```sh
git apply --check /absolute/toolkit/tools/previewer/patches/fluvie-preview-shaders.patch
git apply /absolute/toolkit/tools/previewer/patches/fluvie-preview-shaders.patch
# From packages/fluvie_cli:
dart test test/preview_app_test.dart
```

This links declared shader files, preserves live source updates and bumps the host
cache stamp. Before launch, verify every `flutter.shaders` path exists relative to
the project. Keep shaders under a separate `shaders/` directory; do not also include
them as ordinary assets (including an enclosing `assets/` directory). Compile the
actual project preview and check shader loading before timing review. This bundled
compatibility patch is not a claim that upstream has merged the fix.

Do not apply blindly to other revisions; a future upstream fix can replace it.
The adapter does not modify installed packages or production source automatically.
Check APIs, not just the `0.3.1` version label. Keep a compatible upstream checkout
outside your video project and toolkit. Run `flutter pub get` in that checkout;
a small local executable can forward arguments to
`dart /absolute/fluvie/packages/fluvie_cli/bin/fluvie.dart "$@"`.
Set `FLUVIE_BIN` to that executable (a path, not a shell command).
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

## Shared project configuration

Preview, validation and pipeline export read `composition/fluvie.json` (or
`fluvie.json` at the selected Flutter project root):

```json
{"path":"lib/video.dart","entry":"build","draftEntry":"buildDraft","executable":"/absolute/bin/fluvie"}
```

For a nonstandard Flutter project folder, set `composition_project` in the video
workspace project.json; the pipeline then reads fluvie.json from that directory.
Project executable wins over `FLUVIE_BIN`; the default is `fluvie` on PATH.
Explicit preview file/entry and validator executable arguments override defaults.
The old preview-only environment variable is removed. CLI and package must use
the same pinned source checkout with the compatibility patches. Scaffold pins
that source revision rather than the incompatible original hosted release;
existing manifests, shaders and dependency overrides are never overwritten.
Use path overrides to the patched checkout for preview fixes in the Dart package.

Apply `patches/fluvie-preview-scene-warmup.patch` after the three patches above.
It opts interactive previews into first-frame warming of future clips and bounded
sequential decoding. Default/export behavior is unchanged. This is a reconstructed
shared fix, tested against the pinned revision, not a recovered production patch
or an upstream-merged change. It trades initial preparation and one retained frame
per future source for avoiding cold boundary lookups. Source geometry limits
active decode batches to 32 MiB (at least one frame). Test with:

```sh
cd packages/fluvie
flutter test test/rendering/preview_clip_frames_test.dart test/rendering/runtime/preview_pending_audio_test.dart
```

## Caller-owned review hosts

`PreviewRuntime` accepts `command`, `prefixArgs` and `onEvent(session, event)` for
a caller-owned host integration. The MCP server's `main` accepts
`previewRuntimeFactory(root)`; the default standalone host stays generic.
An integration may supply review progress in `get_preview`. The app frame can
forward a `review-feedback` message after a durable completion receipt; it requests
agent continuation using the outer preview session ID and acknowledges the exact
child window. Failed host notification must be reported as saved feedback with
manual continuation, not as successful agent delivery.

For the pinned compatible CLI, `patches/fluvie-preview-host-adapter.patch` adds
an explicit `FLUVIE_PREVIEW_HOST_ADAPTER` executable hook. It receives the generated
app directory after scaffolding and before Flutter starts. The caller owns its
UI package, dependency preparation and readiness checks. This hook runs trusted
local code; no default brand or private project is shipped. Apply it with
`git -C /path/to/compatible-fluvie apply /absolute/toolkit/tools/previewer/patches/fluvie-preview-host-adapter.patch`.

`patches/fluvie-preview-captions.patch` enables inline and asset SRT/VTT captions
in the compatible browser media resolver using the existing parsers and native
inline timing semantics. Its regression test covers preparation, cached lookup,
SRT/VTT text and the last word's one-second tail. It contains no caller branding.

For an MCP host that deliberately uses an opaque sandbox origin, apply
`patches/fluvie-preview-opaque-origin.patch` to the same compatible checkout.
Setting `FLUVIE_PREVIEW_OPAQUE_ORIGIN=1` then permits `Origin: null` on that
preview's media bridge. The random session token remains mandatory; remote
origins remain rejected, and opaque origins remain rejected by default. Validate
both settings from `packages/fluvie_cli`:

```sh
dart test test/local_media_bridge_test.dart
FLUVIE_PREVIEW_OPAQUE_ORIGIN=1 dart test test/local_media_bridge_test.dart
```
