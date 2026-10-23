---
name: component-author
description: Create or refine vector explainer graphics, SVG assets and editable Flutter diagrams, or maintain reusable toolkit components and their catalog entries.
---

# Component Authoring

Use this entry point for authoring the graphic itself. Video composition and timing
belong to [compose stage](../edit-video/references/compose.md); the consuming workspace
supplies editorial and visual direction. Code paths below are relative to the
toolkit root.

For running the browser, selecting components, MCP setup and the end-to-end
component workflow, use [component-select](../component-select/SKILL.md).

## Vector explainers and flows

Read [Vector explainers](references/vector-explainers.md) when designing or revising
an SVG, flow, technical diagram or custom vector illustration. It covers visual
structure, layout, format choice, motion and review. Start from the explanation
and intended delivery size, then consult `components/CATALOG.md` for reusable
geometry. Do not force every illustration into a node-and-arrow diagram.

Use SVG for a requested standalone vector asset or fixed illustration. Use Flutter
widgets/painters when labels, data, selected states or frame-driven animation need
to remain editable in a composition. The existing Flutter components do not export
SVG. Keep one authoritative source; do not maintain both formats by default.

A project-specific graphic can stay in its composition or local assets. Only add
it to the shared library when reuse is part of the task. A one-off SVG does not
need catalog metadata or a new skill.

## Add or extend a component

Decide ownership first: reusable geometry/behavior belongs in the toolkit;
creator-specific tokens, fonts and wrappers belong in the consuming workspace.
Reuse or extend a variant when the existing widget already expresses the need.
For shader/3D internals use
[component-shaders](../component-shaders/SKILL.md) or [component-3d](../component-3d/SKILL.md).
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
