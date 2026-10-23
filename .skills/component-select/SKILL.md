---
name: component-select
description: Find, inspect and configure existing video components through the catalog or browser; return component IDs, variants and resolved props.
---

# Video Components

Find and configure existing components; return a selection for composition.
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
[compose stage](../edit-video/references/compose.md) for integration and preload requirements.

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

## Selection handoff

Return the canonical component ID, presentation/variant, resolved props and any
platform constraints, or state that no suitable component exists. Reuse a supplied
selection when still valid. Selecting a component does not approve its content.
For a missing or changed implementation, use [component-author](../component-author/SKILL.md).
