# Consolidated catalog families

Nine families group overlapping standalone entries. Named presets preserve their
useful layouts and constructors. The layer-stack family and its compact/labeled
implementations have been removed; unrelated media stacks remain available.

| Family (canonical ID) | Presentations available through presets |
| --- | --- |
| Media carousel (`video.screenshot-rail`) | Screenshot rail, Focus carousel |
| Media stack (`video.screenshot-stack`) | Screenshot stack, Fan of screenshots |
| Lower third (`video.portrait-lower-third`) | Portrait, Rule-only |
| Title card (`video.editorial-title`) | Editorial, Episode, Chapter ticket |
| Closing card (`video.next-episode`) | Next episode, Product sign-off, Event closing |
| Code panel (`video.code-walkthrough`) | Walkthrough, Compact code focus |
| Quote card (`video.quote-card`) | Single quote, Testimonial stack |
| Typography (`video.type`) | Individual text roles, Combined specimen |
| Trend chart (`video.chart-line`) | Line, Filled area |

## Presets, references and compatibility

Open a family and choose a Variant. The original primary presentation keeps its
preset names. Other layouts use `<old-id-suffix>/<preset>`, for example
`episode-title/default` within `video.editorial-title`. Only properties relevant
to the chosen presentation appear. Changing presets resets their properties.

Old component URLs and MCP lookups still resolve to the corresponding family
preset. Discovery/search return the canonical family, including when searching
for an old name or ID. Copied links, references and batch selections use the
canonical ID. One family occupies one batch-selection entry; Update selection
replaces its selected presentation/props.

```json
{
  "component": "video.editorial-title",
  "variant": "episode-title/default",
  "props": {
    "presentation": "video.episode-title",
    "title": "Inside the process",
    "episode": "EPISODE 07",
    "host": "With Alex Morgan"
  }
}
```

The `presentation` is a registered widget implementation, not arbitrary Dart code.
Copied constructor examples use that implementation's existing public API.
Existing source code that directly uses those constructors continues to work.
Consolidation changes discovery and organization, not the set of supported
rendering layouts or production timing.

## Catalog schema version 2

Ordinary entries retain their previous parameter/preset structure. A family adds
`presentations`, a map from original component ID to its implementation metadata,
including its own parameters and original variants. Family variants declare
`presentation` and `sourceVariant`, and carry preset overrides in `props`.

To resolve a family preset, load defaults from its selected presentation's
`parameters`, apply preset `props`, then explicit user overrides. Include the
`presentation` discriminator in serialized props. Do not infer all layout fields
from the family's top-level parameters: those describe the discriminator only.
`get_component` returns the selected `implementation` and resolved `selection`.
`ComponentSpec` in the browser provides the same resolution for Flutter consumers.

Catalog IDs inside `presentations` are compatibility aliases, not extra
standalone catalog entries. Consumers targeting schema version 1 must update
their family resolution before consuming version 2.
