---
name: component-authoring
description: Maintain toolkit components, metadata and the live component browser.
---

# Component Authoring

Widgets live in components/lib; metadata in components/components.json.
Use stable video.* IDs, typed controls and named variants. Add the real builder to
tools/component_browser/lib/specimen.dart and constructor example to catalog.dart.
Metadata cannot dynamically import Dart widgets. Test all variants at portrait and
landscape sizes. Keep neutral examples separate from private brand implementation.
Do not add client images/notes to this public repo. Generate synthetic demo media
with tools/component_browser/scripts/demo_media.py.

Public widgets must accept caller-owned styling. Do not add palettes, brand fonts
or editorial presets to the library. Keep application demo styles local to the
browser; private visual identities belong in the consuming workspace.
