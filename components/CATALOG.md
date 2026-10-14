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
