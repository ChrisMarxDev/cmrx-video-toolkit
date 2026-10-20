# CMRX Video Toolkit component browser

A small Widgetbook-style workbench that renders the **actual `video_components`
Flutter widgets**. No parallel HTML imitations or Widgetbook dependency.

From the repository root:

```sh
make components
```

Then open **http://localhost:8090**. This builds a self-contained Flutter web app
and serves it on loopback; it does not launch or automate a browser. Stop with Ctrl-C.
Demo assets are generated locally by `scripts/demo_media.py` using Python and FFmpeg.
For hot reload, generate them first, then run `flutter run -d web-server --web-port 8090` in this directory.

## Agent skill and MCP extension

Use [video-components](../../.skills/video-components/SKILL.md) for setup, choosing
components, adding widgets/presets and validation.

The [local MCP adapter](../../apps/component-browser-agent/README.md) exposes
`list_components`, `get_component` and `open_component_browser`. Catalog queries
need no Flutter build. Opening serves this same Flutter application and returns a
browser URL plus an MCP App for hosts allowing local embedded frames. Custom prop
changes are shared through Copy flow reference, not an automatic agent callback.

## Browse and refer

Search by friendly name, stable ID, widget class or purpose; filter by category.
Select a component to try its named variants and editable properties. Inspect
16:9, 9:16 and square canvases. Dither and GIF previews animate automatically unless reduced motion is enabled;
pause them or scrub the 300-frame inspection loop. Other motion starts paused. This clock is only for inspection, never a source of video cues.
Previews fit the canvas into the screen, so fine dither needs native delivery-size
review before approving a video. The browser is not a video compositor.

- **Copy flow reference** includes ID, selected preset and current property values.
- **Copy variant link** opens the preset, not unsaved custom properties.
- **Copy code** supplies the real Flutter constructor. Surrounding layout, preloaded
  shader programs and resolved timing remain the composition's responsibility.
- References and examples are selectable if browser clipboard access is unavailable.
- If shader loading is unavailable, those previews show a message; use the native
  gallery for those components. Other widgets remain usable.

Example request:

> Use `video.layers`, variant `top`, while I explain the three stages. Reveal the
> layers one at a time and keep the presenter in the lower-right corner.

```json
{
  "component": "video.layers",
  "variant": "top",
  "props": {"activeLayer": 2}
}
```

This is a component choice for a brief/storyboard, **not a complete annotation or
render command**. Put the stable ID in an annotation's existing `component` field;
keep variant/property instructions in `intent`. The storyboard records resolved
props and timing. Do not paste extra variant/props keys into the strict annotation
schema. Narration cues still come from the imported source-to-output timeline.

## Agent discovery and maintenance

The single metadata catalog is [`../../components/components.json`](../../components/components.json).
It records stable IDs, real widget names/source paths, descriptions, typed controls,
defaults and named preset overrides. The browser loads this package asset directly.
The catalog is available in a built app at `assets/packages/video_components/components.json`.

Read the JSON and [`CATALOG.md`](../../components/CATALOG.md) when planning a
video. IDs are durable: change a display name without renaming its ID. Preset
props are defaults; an explicit props object overrides them. IDs and presets do
not authorize decorative content or invent product behavior.

To add an element:

1. Implement the reusable widget in `components/lib/`.
2. Add its metadata and valid presets to `components/components.json`.
3. Add its actual preview and constructor example in `lib/specimen.dart` and
   `lib/catalog.dart`. Include all meaningful knobs and use canonical tokens.
4. Run the browser tests and build. The variant test covers every registry entry
   in both portrait and landscape; missing builders fail rather than silently hide.

The catalog covers 24 entries, including media, technical diagrams and charts. Shader internals,
asset loaders, token constants and the Fluvie video wrapper remain documented
APIs rather than separate browsable content components.

## Validation

```sh
python3 scripts/demo_media.py
flutter pub get
flutter analyze
flutter test
flutter build web --no-web-resources-cdn
```

An optional native Flutter review frame (not a browser screenshot):

```sh
flutter test --dart-define=BROWSER_REVIEW_PNG=/absolute/path/overview.png
```

Builds, screenshots and generated previews stay local and ignored. No footage,
transcripts, telemetry or external font fetches are used by this app. This tool
belongs to CMRX Video Toolkit; it does not define another client's creative direction.


## Media and texture previews

Open `video.image`, `video.video` or `video.gif` and compare contain, cover or framed
variants. Video has native play/pause, seeking and muted playback controls in its
inspector. GIF follows the shared inspection clock, including pause and reverse
scrubbing. The demo is an original lavender/ink/lime geometric loop, not a user
recording. This version previews bundled samples; it does not upload or select
personal media. Replace asset paths in the composition when using your footage.

For texture, select `lavender-lime` on `video.texture` or
`video.dither-background`. Both are animated in the browser by default; the frozen
presets remain still. Pause all overview animation with its preview control.
Native widget tests validate GIF timing and shader pixels; they do not certify
HTML video playback in a browser. The production video component supplies a
frame around a caller-provided Fluvie Clip, not an HTML player in exported video.

All styled specimens use the browser-local grayscale `lib/demo_style.dart`.
Constructor examples assume an application-defined `demoStyle: VideoStyle`;
provide your own palette and typography (see `components/CATALOG.md`). The public
library does not bundle brand fonts or export default typography.


## Technical visuals

Filter **Technical diagrams** or **Charts** for nodes, connectors, flowcharts,
architecture recipes, layer stacks, grids, sequences, annotations and four
Fluvie-backed charts. Detail pages show usage notes and contextual sample presets
alongside the editable preview and copyable Dart constructor. Chart data is
edited as one `Label: value` per line; invalid input displays an explanation.
Recipe constructors in the public package additionally require
`package:video_components/technical_samples.dart`. All samples are illustrative.

## Preview themes

Use the top-right Original / Rounded / Editorial selector to compare the same
components with different parent tokens. Selection persists when opening another
component. Constructor snippets inherit a `VideoThemeScope` supplied by your
composition; see [the theme API](../../components/THEMING.md). Explicit component
style remains available for intentional local overrides. Preview presets are
application examples and are not library defaults.
