---
name: video-components
description: Run and use the component browser, discover and select video widgets, add components and presets, and validate their catalog, preview and composition integration. Use for the overall component workflow or component-browser MCP setup; use component-authoring for detailed graphic construction.
---

# Video Components

Own the workflow from finding a component to a working, browsable implementation.
Paths below are relative to the toolkit root. Read `components/CATALOG.md` and
`tools/component_browser/README.md`; inspect `components/components.json` for actual
IDs, variants, props and source paths. The workbench renders real Flutter widgets.
It is not a video editor or a dynamic Dart plugin loader.

## Discover and choose

If configured, use `list_components` to search and `get_component` to inspect the
full metadata and resolved preset values. These MCP tools need only Node and the
adapter dependencies, not Flutter. Otherwise read the catalog files directly.
Search by purpose before inventing a new widget. Explain which component/variant
fits the content and which props need to change. Metadata defaults do not approve
styling, sample claims or decorative content for a production video.

For a visual choice, use `open_component_browser` with optional `id` and `variant`.
It returns an MCP App plus `browserUrl`; inline display depends on the host allowing
local nested frames. It serves this checkout's actual Flutter app, builds when
missing and reuses the build thereafter. Set `rebuild: true` after source changes.
Do not infer that UI failed merely because the tool returns structured data.
Follow host permission rules before browser/computer automation or screenshots.
Starting a local server does not grant permission to inspect its UI.

The schema-version-2 catalog groups related layouts into families. See
`components/FAMILIES.md`: family variants select a presentation with its own
property schema. Resolve those defaults before applying overrides; copied
references include the canonical ID and presentation. Old IDs remain aliases.

The creator can inspect variants, edit props, compare aspect ratios and scrub the
inspection clock. Ask them to share **Copy flow reference** for custom values;
there is no automatic selection/approval callback to the agent. **Copy variant
link** preserves the preset, not unsaved props. **Copy code** gives a constructor,
not a complete composition. Clipboard fallback text is selectable.

Carry component ID, variant and resolved props into the storyboard. In the strict
annotation schema only use the existing `component` field and describe variant/props
in `intent`; do not add unsupported keys. Use the imported edit timeline for cue
windows, never the browser's inspection clock. Read
[video-compose](../video-compose/SKILL.md) for integration and preload requirements.

## Run and set up

Operate setup commands for the user; do not send a nontechnical creator to a
terminal. Inspect `docs/EXTERNAL-REQUIREMENTS.md` and install only what this task
needs. In an existing developer checkout:

```sh
make components
```

This generates synthetic media, builds the web app and serves localhost:8090.
Keep the process alive while the user is using it; stop your owned process when
finished. Without Make, run the commands in the browser README. Hot reload uses
`flutter run -d web-server --web-port 8090` from `tools/component_browser` after
media generation. Rebuild when catalog or Dart source changes.

For MCP setup read `apps/component-browser-agent/README.md`. Install its locked
Node dependencies and register its stdio entrypoint in the user's requested local
host when configuration is authorized. Do not edit unrelated host configuration.
The adapter uses a dynamic loopback port; it does not auto-open a desktop browser.
A host restart/reconnect may be needed to load new tools. No remote tunnel is part
of this workflow. Report missing Flutter or host capabilities precisely rather
than substituting a mock preview or claiming the browser has been validated.

## Add or extend a component

Decide ownership first: reusable geometry/behavior belongs in the toolkit;
creator-specific tokens, fonts and wrappers belong in the consuming workspace.
Reuse or extend a variant when the existing widget already expresses the need.
For detailed SVG/Flutter graphic work read
[component-authoring](../component-authoring/SKILL.md). For shader/3D internals use
[video-shaders](../video-shaders/SKILL.md) or [flutter-scene](../flutter-scene/SKILL.md).
Do not promise that native-only 3D/shaders will work in Flutter web.

For a public reusable widget, keep these parts in sync:

1. Implement/export the widget under `components/lib/` with immutable inputs,
   caller-owned `VideoStyle` where appropriate, and deterministic frame/progress
   inputs for motion. Keep required media/program loading explicit.
2. Add its stable `video.*` ID, source/widget, category, typed controls, defaults
   and real preset overrides to `components/components.json`. Preserve IDs when
   renaming display text. Update `components/CATALOG.md` for the public contract.
3. Add the actual preview builder in `tools/component_browser/lib/specimen.dart`
   and a matching constructor example in `lib/catalog.dart`. Cover meaningful
   controls and named variants; metadata alone cannot instantiate a new widget.
4. Add focused tests for behavior and limits. The browser's existing registry tests
   exercise variants in portrait and landscape. Use synthetic sample data/assets;
   keep provenance for any third-party material.

A private component requires registration in its own compiled integration app.
The public MCP adapter serves the public toolkit browser only; it does not discover
or load private packages. Do not publish private implementations to make them visible.

## Validate and hand off

Run affected Flutter analysis/tests in `components` and `tools/component_browser`,
regenerate demo media if needed, and build the browser using its README commands.
For MCP changes run `npm --prefix apps/component-browser-agent test`. Check actual
rendered output at target dimensions with permitted tools when visuals change;
unit tests and compilation do not establish visual quality or host acceptance.

Check that copied references, presets and constructor examples match the working
implementation. Record any native-only fallback or unavailable preview. Report
files changed, checks performed and unverified UI/platform behavior. Keep generated
media/builds ignored and follow repository synchronization rules.
