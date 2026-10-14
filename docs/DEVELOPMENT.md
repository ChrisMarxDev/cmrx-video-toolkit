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

## Documentation site

`docs/` is a standalone Astro Starlight app. Install with `npm --prefix docs ci`,
then use `npm --prefix docs run dev` or `npm --prefix docs run build`. Node >=22.12.
The docs use CMRX colors solely as website identity; video widgets remain unstyled.
No private workspace dependency is needed. Reference pages are regenerated from
canonical public Markdown by `docs/scripts/sync-reference.mjs`.

The pinned `postcss-selector-parser` override includes the 7.1.6 complexity fix
while upstream Expressive Code dependencies catch up. Reassess it on upgrades.

The Documentation GitHub Actions workflow builds PRs and deploys main to
https://chrismarxdev.github.io/cmrx-video-toolkit/. GitHub Pages uses Actions as its
source. Only docs output is uploaded; media, Flutter build artifacts and local
workspaces are never included.
