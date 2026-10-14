---
name: video-shaders
description: Create deterministic Flutter shaders and capture them reliably.
---

# Video Shaders

Use components/shaders and ShaderSurface. Float slots 0–1 are width/height;
remaining uniforms are shader-specific, sampler 0 is caller-owned image. Preload
FragmentProgram on a real async loop before frame zero. Fluvie 0.3.1 headless preset
warmup was unreliable; explicit preload and synchronous paint is the tested path.
Use frame/fps, premultiplied alpha and finite uniforms. Test reverse seeks, alpha,
actual encoded output and source provenance. Use flutter-scene for actual meshes.
