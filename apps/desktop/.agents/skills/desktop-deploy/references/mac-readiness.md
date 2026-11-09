# Mac readiness and first implementation

## Establish facts each run

The initial 2026-11-09 baseline is Linux development support and source-only release
drafts. Inspect current code instead of treating these historical gaps as permanent:

| Area | Inspect | First Mac requirement |
| --- | --- | --- |
| Provider installer | `apps/desktop/src/runtime-manager.mjs` | Darwin artifacts/checksums for the requested CPU, including Codex's matching code-mode companion; first-connect download/cancel/retry |
| Render isolation | `src/playground.mjs`, `src/engine-status.mjs` | macOS worker/provisioning; current Bubblewrap, Linux mount paths and GNU copy flags cannot be reused blindly |
| Desktop packaging | package.json, packager config, desktop.cjs, server.mjs | Actual Electron .app with correct entrypoint, child services, resources and production dependencies |
| Render dependencies | Flutter/Dart/Fluvie/compiler/media configuration | Versioned, reproducible runtime and first-run provisioning; no implicit developer's PATH, Pub cache or installed SDK |
| Releases | `.github/workflows/desktop.yml`, RELEASING.md | Current tag job produces source drafts; installer assets need a Mac job and coordinated draft handling |

The supplied preflight probes local requirements and provider Darwin metadata. Its
static renderer/packager findings are conservative indicators, not proof of
sandboxing, codesigning or clean-machine readiness. Update probes when implementing
new interfaces; never remove a blocker merely to make the report green.

## Local or remote Mac

Start with `uname -m`, `sw_vers`, available disk space, Node >=22.12, Git/npm and
`xcode-select -p`. Inspect installed Xcode tooling before invoking installation.
Read `xcrun --find notarytool` and `security find-identity -v -p codesigning` locally;
identities are not private keys, but avoid posting personal account details publicly.
Do not accept licenses or enroll/purchase memberships on the user's behalf without
authorized account interaction. Missing Apple setup does not block code preparation.

Discover a linked Mac through the host's remote-environment tools when available.
Use the environment ID for that machine's commands. An agent without those tools
can run the same skill directly on the Mac in a normal repository checkout. A Mac
is needed for real native acceptance; a Linux-host build result is insufficient.

Keep disposable outputs outside the public checkout, e.g. a named folder in
`${XDG_CACHE_HOME:-$HOME/.cache}`. Use an isolated test profile and synthetic sample
workspace. Do not wipe the user's normal app profile or recordings.

## Port the full toolkit experience

Provider binaries are platform-specific. Resolve Darwin release assets from the
official provider source, verify expected hashes, companion compatibility and CPU
architecture, and retain provider notices. Do not re-sign/repackage third-party
binaries casually. First-connect downloads must be authenticated by checksums and
recover without half-installed executables. Preserve explicit connection per launch.

For rendering, implement an explicit macOS worker adapter rather than disabling
isolation after `bwrap` fails. Decide how generated code gets bounded source/media
access, offline networking, process-tree cancellation and isolated caches. Preserve
read-only originals, app-profile/credential exclusion and one shared heavy-render
slot across projects. Assess native compiler/tool requirements on an unprepared Mac;
if the chosen approach still needs user-installed Xcode/Flutter/Homebrew, report
that limitation and do not label it a nontechnical installer. Any dependency/runtime
redistribution must retain licenses and permitted sources. Research those terms
when selecting the bundle; this skill does not grant redistribution rights.

Keep first-class graphics clips, trim/source timing, transparent live cache and full
export aligned. Test freshly authored Dart widgets/shaders, not just bundled demos.
A remote Linux render service would change the offline/local product promise; do not
silently adopt it as a workaround.

Choose one maintained Electron packaging stack after inspecting current dependencies
and official docs. Preserve the existing React editor and provider-neutral broker.
Package only reviewed public source/resources plus required runtime files; never the
outer private repository, test profiles, recordings or signing credentials. Ensure
compiled editor output and shipped .mjs/browser assets resolve after packaging,
including ASAR/native executable boundaries and writable cache locations. Verify
child-process Node mode against packaged Electron security/fuse settings; a dev
shell's `process.execPath` behavior is not sufficient evidence.

Keep CMRX Chat Editor's existing app/profile identity stable. Select a durable bundle
ID once; do not guess a different one for every run. Offer Apple Silicon first when
coverage is unspecified, and label unsupported Intel systems honestly. A universal
claim requires working native dependencies for both architectures.

Expose implemented deterministic steps as named Make targets backed by scripts
(e.g. macos-build, macos-verify), document real arguments, and update dependency
inventories/lockfiles/notices. These target names are suggestions until implemented;
inspect `make help`/Makefile and never pretend nonexistent targets already work.
Mac tests must run the produced .app, not only `electron src/desktop.cjs`.
