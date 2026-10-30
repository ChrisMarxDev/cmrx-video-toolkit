# Vector explainers

## Start from the relationship

Identify what the viewer should understand, the actual entities and relationships,
and the requested output: a standalone asset, static slide or timed video graphic.
Use the existing brief and narration when available. For a small request, this can
be a sentence; it does not need a separate planning document.

Choose structure by meaning:

- Process: stages and directional connections. Use a branch only for a real choice,
  and label its outcomes; a return arrow should identify what repeats or returns.
- Architecture: containment, boundaries and connections between responsibilities.
  Position does not imply execution order unless the graphic explicitly says so.
- Sequence: participants with messages ordered in time, especially request/response.
- Layers or exploded view: containment, assembly or abstraction levels.
- Grid: spatial positions, indices or selected regions.
- Custom illustration: draw the relevant parts and their relationships directly
  when boxes would hide the idea. Use callouts for details that need identification.
- Quantities: use a chart with units and a source. Do not encode arbitrary numbers
  as though they were measurements; label synthetic examples as illustrative.

Reuse `components/CATALOG.md` and its contextual recipes where they fit. Preserve
user-specified formats and visual direction. There is no default isometric view,
illustration style, palette or prescribed number of elements.

## Layout before decoration

Work in a bounded design space with margins and reserved areas for surrounding
content, such as captions or a presenter if the composition contains them. Place
labels with nodes, then route connections; adding labels last often breaks layout.

Give equivalent roles equivalent size and styling. Use spacing and alignment to
show grouping; reserve emphasis for the relation or state being explained. Keep
object positions stable across related beats so viewers can follow the change.
Keep names concise, but retain distinctions needed to understand the mechanism.

Connect to deliberate ports on shape boundaries, keeping arrowheads outside labels
and away from corners. Route around intervening nodes, not through them. Separate
edge labels from crossings; make junctions distinguishable from unrelated crossing
lines. Use line styles consistently and explain their meaning when not apparent.

Design portrait separately when requested. Reflow stages, reroute arrows and adjust
labels instead of shrinking a landscape diagram until text becomes illegible.
Judge stroke weight and type at delivery size, not only at a zoomed editor scale.

## SVG assets

Use a meaningful `viewBox`, deliberate dimensions/aspect ratio, and semantic groups
with stable IDs for parts likely to be edited. Keep geometry, labels and annotation
layers understandable in source. Use shared definitions for repeated symbols or
arrow markers when helpful; scope IDs if several SVGs will be embedded together.

Deliver actual vector geometry for a vector request. Avoid embedding a rasterized
diagram inside an SVG wrapper. Keep text editable unless the destination requires
outlines; if outlining for compatibility, retain the editable source and necessary
font/license information. Include a title/description for meaningful web assets.

Use explicit fills and strokes for portable assets and leave room for markers,
strokes and filter extents at the viewBox edges. Do not rely on a host page's CSS,
remote fonts or external images unless that dependency is part of the agreed output.
Prefer simple paths, groups and clipping; introduce filters, masks or embedded HTML
only when the actual target renderer supports them and they serve the illustration.

Treat an SVG imported into a video as an asset unless the chosen renderer explicitly
supports its animation. Browser CSS/SMIL animation is not a portable video timing
contract. For independently moving parts, expose separate assets/groups through a
supported renderer or author them as Flutter geometry. Do not promise that importing
an SVG preserves browser behaviour or converts it into editable Flutter components.

## Editable Flutter graphics

Use `VideoStyle` from the caller and immutable geometry/state. Use
`TechnicalSequence`, `TechnicalGrid` or `TechnicalAnnotation` where appropriate;
consult the catalog and current constructors rather than guessing APIs.
The former graph renderer and its node/connector recipes have been removed.

For custom shapes, keep model coordinates separate from canvas fitting, and derive
attachment points and labels from the same geometry. Use a painter or composed
widgets as the shape requires. Prefer a small local implementation to adding a
general drawing framework for one scene. Keep inputs such as labels, selection,
expansion and reveal progress explicit when they need to vary.

## Motion that explains

Describe the settled states first, then what changes between them: a connection
becomes visible, an item travels, a layer separates, a selection changes. Use motion
to make that relationship legible and leave time to read its result. Continuous
movement or decorative entrances should not compete with the explanation.

Map each beat to edited-output time through the composition workflow. A useful
normalized progress is `clamp((time - start) / duration, 0, 1)` for a positive duration;
derive time from frame/fps. Define instantaneous changes as explicit state switches.
Use easing for position changes, while preserving meaningful event order. Do not
introduce wall-clock timers, unseeded randomness or state accumulated by playback.

A whole-diagram edge reveal is not a traversal algorithm. For independently timed connections, compose
edge groups sharing the same layout or use an appropriately scoped custom painter.
Do not move nodes just because another edge is appearing.

For example, a synthetic “input → transform → output” explainer can hold all three
positions, highlight input, reveal the first connection, highlight transformation,
then reveal the second connection and result. The narration supplies the actual
cue times. A static SVG can show the settled relationship without a timeline.

## Review and handoff

Validate both meaning and rendering:

- Check that arrow direction, branch labels, boundaries and ordering match the
  explanation. Colour should not be the only way to distinguish essential states.
- Render with the intended consumer at the requested size. Inspect complete labels,
  crossings, arrowheads, clipping, contrast and reserved content areas. An XML parse
  or successful Flutter build alone does not establish visual correctness.
- For motion, inspect the start, an intermediate pose, each meaningful state change
  and the final hold. Seek backwards or render frames out of order to catch hidden
  playback state. Check supported aspect ratios, not unrequested exports.

Use existing local render/test tooling where available. Follow the host's permission
rules before browser or computer UI automation. If a target renderer or visual
review is unavailable, report the specific gap rather than claiming it was checked.

Deliver the editable source and the requested asset or composition, with relevant
font/asset provenance. State which outputs and animation states were inspected.
Register a reusable component only when that is part of the task; keep examples
synthetic and styling owned by the caller.
