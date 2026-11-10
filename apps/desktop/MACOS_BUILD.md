# Apple Silicon candidate builds

Future builds use `resources/macos-placeholder.icns`, generated from the sibling
PNG with `make -C apps/desktop macos-icon`. The builder uses macOS `sips` and
`iconutil` to include standard and Retina sizes. The approved CMRX mark source and provenance
are recorded in `resources/macos-placeholder-provenance.json`. This asset was
added after the frozen `desktop-v0.1.0` candidate and does not modify that installer.

The Mac implementation bundles Electron, Flutter/Dart, Fluvie and offline Pub
packages, plus static FFmpeg/ffprobe. Friends do not install developer tools.
Connecting an account downloads the pinned official Codex or Claude runtime
through the app. This document describes maintainer builds; it is not an
end-user installation guide. Final release acceptance is still required.

The current target is Apple Silicon and macOS 15 or later. Build on an Apple
Silicon Mac with Xcode command-line tools, Node/npm, Python 3, make and pkg-config.
Use the package lockfiles for JavaScript dependencies.

## Runtime inputs

Prepare Flutter 3.47.7 at revision
`abaf9c523780a608bd46686fd5e53740a07077f8`, including macOS engine artifacts and
the Flutter tools' resolved Pub dependencies. Prepare Fluvie at revision
`10e442c1bb469118516df3335547f85ec92155e6`, including its resolved packages.
The packaging command expects that checkout under
`PUB_CACHE/git/fluvie-10e442c1bb469118516df3335547f85ec92155e6`.
Do not use caches containing private packages or credentials.

Run `scripts/prepare-macos-sdk.py --sdk /path/to/flutter --pub-cache /path/to/cache`.
It patches Flutter tester's random WebSocket port to accept `CMRX_TEST_PORT`
and rebuilds the tool snapshot. This lets the Seatbelt worker allow one local
port while denying other network connections. The patch checks the exact SDK
revision and source text before applying.

Build media tools with
`scripts/build-macos-media.py --output /outside/checkout/media`.
The script verifies upstream archive hashes and builds FFmpeg 8.1.2 with pinned
x264, libvpx and Opus. It records sources, commands, binary hashes and licenses,
and creates a corresponding-source archive. Distribute that archive alongside
the installer containing these GPL-enabled FFmpeg binaries.

## Package and verify

From `apps/desktop`, install locked dependencies with `npm ci --include=dev`,
then run:

```sh
node scripts/package-macos.mjs --output /outside/checkout/candidate \
  --sdk /path/to/flutter --pub-cache /path/to/cache \
  --media-bin /outside/checkout/media/prefix/bin
```

Release packaging requires a clean committed checkout. `--development` permits
a dirty prototype and records it as such; do not publish that prototype.
Framework symlinks must remain intact. The runtime manifest records source and
runtime versions; media checksums describe the binaries before signing.

`scripts/verify-macos.mjs --app /path/to/App.app --output /new/test/folder`
renders a new animated graphic over synthetic footage with audio, verifies
decoded pixels and output metadata, and uses an isolated HOME without developer
tool paths. Native UI tests use isolated Electron userData/provider accounts
while retaining the OS login HOME for macOS Keychain compatibility.

Opening a fresh project must not initialize Keychain storage. Saving or using an
API key accesses encrypted device storage and may prompt for permission; the
settings page explains this before saving. Account login uses the provider's
browser flow and is a user action.

Follow [the signing and release procedure](.agents/skills/desktop-deploy/references/signing-release.md)
and [the exact-artifact acceptance matrix](.agents/skills/desktop-deploy/references/acceptance.md).
Before invoking signing or credential-related tests, explain any expected macOS
permission prompt to the operator. Never collect passwords in chat.
