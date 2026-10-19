# Development

Run commands from the toolkit root. `make test` covers Python pipeline/media
operations, dither CPU tests, Flutter components/gallery, browser, and editor.
`python3 -m unittest discover -s apps/editor/tests -v` checks the local review app,
including two synthetic real-FFmpeg exports. `apps/editor/tool/full_flow.py` also
checks real local recognition and HTTP lifecycle for two narrated test videos.
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

## Local checks and CI storage

Run `make setup-dev` once per clone to install locked review/docs dependencies and
activate the tracked pre-push hook. Python 3, Node 22.12+, FFmpeg and Make must be
available. The installer preserves custom hook configurations by refusing to
replace them. Hooks are local Git configuration and do not install with a clone.
Studio bootstrap also installs these dependencies and the toolkit hook.

Every toolkit push runs `make check-local`: Python pipeline/editor tests, JavaScript
model/dither tests, MCP integration tests and the docs build. Failures block the
push. Run `make test` separately for Flutter changes. Local hooks can be bypassed
and only test the current checkout/platform; they are not server enforcement.

The three-platform editor workflow is manual (`workflow_dispatch`), intended for
compatibility checks before releases. Existing Windows/macOS integration failures
still need diagnosis; moving checks local does not fix those failures.
Documentation still builds on relevant PRs and deploys main automatically. It uses
no Actions dependency cache and uploads only a one-day Pages deployment artifact
on deployments, never on PRs. Do not add build/media uploads or caching by default.
