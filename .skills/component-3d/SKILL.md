---
name: component-3d
description: Render procedural or imported 3D geometry with Flutter Scene.
---

# Flutter Scene

Use assets/capture.dart and references/native-capture.md. This is native macOS
Metal/Impeller GPU capture, not proven headless Fluvie integration. Use deterministic
camera/geometry/light poses from frame/fps; preload/warm resources, call explicit
scene.update(1/fps). Preserve model/texture provenance. The procedural example
needs no external model. Inspect intermediate poses and depth intersections. CLI
rendering is distinct from UI automation; follow the host's permission policy.
