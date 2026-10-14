# Video components

Import `package:video_components/video_components.dart`. See components.json for
stable IDs, props and named presets. Browse the actual widgets with `make components`.
The neutral palette is an example, not a required client identity. Font files carry
SIL OFL notices. Load fonts and shader programs before frame zero. Supply time from
the imported edited-output timeline. Source and output timestamps are distinct.

Contains stage/block/caption/code widgets, technical layers, deterministic reveal,
image/GIF/video helpers, ordered dither and shader surfaces. Full-background dither
composites clean foreground content; it never filters faces or captions.

The browser ships builders for this catalog. To add another component, update the
catalog, specimen builder and constructor example together; metadata does not load
arbitrary Dart code. Client-specific registries are compile-time integrations.
