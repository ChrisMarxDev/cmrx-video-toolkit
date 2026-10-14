# Development

Run commands from the toolkit root. `make test` covers Python pipeline/media
operations, dither CPU tests, Flutter components/gallery, browser, and editor.
`dart run tool/smoke.dart` from apps/editor checks a synthetic real-FFmpeg export.
Build tools/component_browser with `flutter build web --no-web-resources-cdn`.
Synthetic demo files are generated locally and ignored.

Brand-specific code stays in consumer workspaces. The public browser is a working
example catalog with compile-time builders; adapting it to a private registry
currently requires a small integration app. Metadata alone cannot load arbitrary
Dart implementations. The Studio keeps its existing CMRX registry integration.

For agent changes, read the relevant .skills entry, preserve edit precision and
original media, validate actual output when changing visuals, and follow git-sync.
If consumed as a submodule, push a reachable toolkit commit before updating its
parent pointer. Do not assume a parent private repo is available to standalone users.
