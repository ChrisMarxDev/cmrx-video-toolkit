---
name: component-authoring
description: Create or refine vector explainer graphics, SVG assets and editable Flutter diagrams, or maintain reusable toolkit components and their catalog entries.
---

# Component Authoring

Use this entry point for authoring the graphic itself. Video composition and timing
belong to [video-compose](../video-compose/SKILL.md); the consuming workspace
supplies editorial and visual direction. Code paths below are relative to the
toolkit root.

For running the browser, selecting components, MCP setup and the end-to-end
component workflow, use [video-components](../video-components/SKILL.md).

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

## Reusable components and catalog maintenance

Widgets live in `components/lib`; metadata in `components/components.json`.
Use stable `video.*` IDs, typed controls and named variants. Add the real builder to
`tools/component_browser/lib/specimen.dart` and constructor example to
`tools/component_browser/lib/catalog.dart`.
Metadata cannot dynamically import Dart widgets. Check supported variants at
portrait and landscape sizes. Keep neutral examples separate from private brand
implementation. Generate synthetic demo media with
`tools/component_browser/scripts/demo_media.py` when needed.

Public widgets must accept caller-owned styling. Do not add palettes, brand fonts
or editorial presets to the library. Keep application demo styles local to the
browser; private visual identities, images and notes belong in the consuming
workspace. Use the reference's review guidance for graphics and affected package
checks for code changes.
