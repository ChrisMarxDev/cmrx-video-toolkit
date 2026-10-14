# Video components

Import `package:video_components/video_components.dart`. The package lives in
`components/`; `assets/` is reserved for actual static resources. It contains
reusable layout/media widgets, deterministic motion, shader surfaces and shaders.
There is no toolkit brand palette, font bundle or typography system.

Styled widgets require an explicit `VideoStyle` from the caller. Supply all colors
and text styles; client identity belongs in the consuming workspace. The browser's
`lib/demo_style.dart` is an application-local grayscale demonstration, not a library
export. Low-level `DitherStyle` uses black/white technical defaults and accepts
arbitrary colors. Load programs/media before frame zero and supply time from the
imported edited-output timeline. Source and output timestamps are distinct.

See `components.json` for stable IDs, interactive props and named presets. Every
styled widget also requires `style`, supplied by the host rather than serialized
as a browser control. Browse the actual widgets with `make components`.

The browser ships builders for this catalog. To add another component, update the
catalog, specimen builder and constructor example together; metadata does not load
arbitrary Dart code. Client-specific registries are compile-time integrations.

## Migration from design_system/

Change path dependencies to `components/` (the Dart package name remains
`video_components`). Replace `VideoTokens` and `VideoType` with your own palette
and text styles, pass `style: yourStyle` to styled widgets, and rename the old
`lavenderLime` option to `accentPalette`. Fonts are owned by consuming applications.
`Reveal`, shader/motion helpers and shader asset package paths are unchanged.

## Technical drawings, diagrams and charts

The catalog now has 24 entries, including 12 technical entries. These are Flutter
widgets/custom vector painters, so the same instances work in video compositions,
Flutter Deck slides and the browser. They have no brand palette or bundled fonts.
SVG remains appropriate for a fixed illustration; use these widgets when labels,
data, selected states or animation must remain editable.

| Catalog ID | Public API | Useful presets |
|---|---|---|
| `video.diagram-node` | `TechnicalNode` | Process, terminal, decision, database, document |
| `video.connector` | `TechnicalDiagram`, `DiagramEdge` | Labeled arrow, dashed response |
| `video.flowchart` | `technicalDiagramExample` | Pipeline, portrait pipeline, decision, feedback |
| `video.architecture` | `technicalDiagramExample` | Service map, retrieval pipeline, worker fan-out |
| `video.layer-stack` | `TechnicalStack` | Software layers, packet layers, exploded assembly |
| `video.tensor-grid` | `TechnicalGrid` | Matrix, memory addresses, illustrative weights |
| `video.sequence` | `TechnicalSequence` | Request/response, agent/tool call |
| `video.annotation` | `TechnicalAnnotation` | Crosshair and leader over any child |
| `video.chart-bar` | `TechnicalChart` | Category comparison |
| `video.chart-line` | `TechnicalChart` | Equally spaced ordered observations |
| `video.chart-area` | `TechnicalChart` | Equally spaced magnitude trend |
| `video.chart-donut` | `TechnicalChart` | Parts of one positive total |

Pages include contextual samples, usage notes, editable properties, copied Dart
constructors and stable component references for briefs. Sample data is synthetic.
Recipes are optional: import `package:video_components/technical_samples.dart`.
The core node/edge models are exported by the normal package entry point.

```dart
technicalDiagramExample(
  DiagramExample.retrieval,
  style: yourStyle,
  progress: progress,
  labels: {'query': 'Question'},
)

TechnicalChart(
  style: yourStyle,
  kind: TechnicalChartKind.bar,
  data: {'Before': 12, 'After': 28},
  unit: 'items',
  source: 'Illustrative data',
  progress: progress,
)
```

Use a bounded parent. Diagram coordinates are logical pixels in `designSize`,
uniformly scaled to fit; layouts do not reflow automatically. Nodes/edges are
immutable snapshots, and graph construction validates IDs, bounds and endpoints.
Ports and optional explicit `via` points control routing. Default routing is
orthogonal but does not avoid obstacles; route loops around intervening nodes.
Use the portrait pipeline preset or deliberately arrange a portrait graph.
Node labels wrap to three lines and ellipsize; keep labels short and put longer
explanations outside the diagram. Layers accept 1–6 entries, grids 1–12 rows and
columns, sequences 2–5 participants and 1–8 messages.

All progress/expansion values are explicit, finite 0–1. No timers are introduced.
Connectors reveal along paths, sequences reveal message by message, and layer
expansion is reversible. Set progress to 1 for static slides, or derive it from
the edited-output frame for video. Individual node emphasis is explicit model
state; graph reveal does not imply traversal or computation order.

Charts delegate geometry to Fluvie 0.3.1 using an isolated, progress-driven frame
scope, allowing use in plain Flutter without a video renderer. Fluvie also exposes
pie and scatter; this catalog starts with four basic chart types. The wrapper
adds a readable key/value legend, unit and source because this Fluvie version's
painter does not draw readable axis/category labels. Legend values are the final
data, not animated counters. Charts accept 1–8 finite nonnegative values; line
and area require at least two, donut requires a positive total. Line/area spacing
is categorical, not proportional elapsed time. Use Fluvie's lower-level series
API for numeric x coordinates or multiple series. Small explanatory charts are
not a replacement for a scientific plotting package. Keep labels concise.
`parseTechnicalChartData` reads one unique `Label: value` per line and rejects
invalid data instead of silently altering it.
