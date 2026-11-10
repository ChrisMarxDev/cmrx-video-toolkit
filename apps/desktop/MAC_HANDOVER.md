# Mac agent handover — 2026-11-10

## Outcome

Make the desktop video app usable by nontechnical Mac users: download/install,
launch, sign in to a supported provider, and create/edit/export a video. No terminal,
manual Homebrew/Xcode/Flutter/FFmpeg/Node/Pub-cache setup or preinstalled provider CLI.
Dependencies may be bundled or provisioned automatically with clear in-app progress.
Choose the simplest reliable native Mac solution. Normal OS permission/sign-in
prompts are fine. A working window on a developer Mac is not completion.

Preserve arbitrary new Flutter/Dart/shader authoring. Fixed component presets or
flattening graphics into replacement footage do not satisfy the product goal.

## Start here

Work in the public repository `ChrisMarxDev/cmrx-video-toolkit`, current `main`.
Pull current source; do not assume this handover's commit is the latest. A private
Studio checkout is not required. If working inside Studio, follow its submodule
and knowledge rules and push toolkit before updating the Studio pointer.

Read:

- `AGENTS.md` and `apps/desktop/AGENTS.md`.
- `apps/desktop/.agents/skills/desktop-deploy/SKILL.md` — use this deployment skill.
- Its `references/mac-readiness.md`, `acceptance.md`, `signing-release.md`.
- `apps/desktop/{README,RELEASING,WORKSPACES,STATE_MACHINES}.md`.
- `docs/EXTERNAL-REQUIREMENTS.md` and `THIRD_PARTY.md`.

Initial commands from toolkit root:

```sh
uname -m
sw_vers
xcode-select -p
make desktop-deploy-preflight
make desktop-deploy-check
```

Preflight blockers are expected until the port is implemented. Update probes as
capabilities become real; do not remove checks to make the report green. Developer
build tools can be used on this machine; acceptance must exclude reliance on them.

## Current source and evidence

Packaging work landed in `f7555d9`, `c0e4725`, `4713b12`. The latter is the baseline
when this handover was prepared. These add a **Linux-only** Debian/Ubuntu AMD64
installer candidate, not a Mac port. No new release tag or public release was made.

- Electron: 43.0.0 official Linux binary, checksum pinned in the Linux builder.
- Flutter: 3.47.7, revision `abaf9c523780a608bd46686fd5e53740a07077f8`;
  bundled Dart reports 3.13.5.
- Fluvie: `10e442c1bb469118516df3335547f85ec92155e6`.
- Provider versions/checksums are in `src/runtime-manager.mjs`; inspect live official
  Darwin release metadata rather than invent checksums or copy Linux hashes.

Linux evidence: 56 desktop unit/service tests; packaged Electron native onboarding
with a fixture provider and a real 20-second imported sample; actual new Flutter
source rendered as an independent layer over footage/audio using bundled SDK/cache,
fresh HOME and system-only PATH. Duration/resolution/audio and decode were checked.
This proves neither Mac behavior nor a real account sign-in in the installed package.

The clean Ubuntu installed-candidate run was still in progress when inspected:
https://github.com/ChrisMarxDev/cmrx-video-toolkit/actions/runs/42750513147
It tests commit `c0e4725`; check its actual conclusion. A prior run failed during
build-cache preparation and was fixed. Artifact retention was added in `4713b12`,
so that older in-progress run does not contain the later upload step. Do not claim
Ubuntu installed acceptance or a downloadable CI binary without checking.

## Architecture to preserve

Electron owns the native window/tabs and local project services. Each project has
an embedded React/TypeScript editor (`apps/local-editor`) and plain-JS chat UI.
The app broker calls provider CLIs in child processes and exposes editor/files/
skills/MCP/HTTP tools. The editor service owns revision-checked timeline mutations.

`project.json` is the authority. Source media and Flutter graphics stay separate
editable clips. One player composites live media with transparent per-track Flutter
caches. Full exports render immutable source/manifest snapshots. A shared render
queue serializes heavy jobs across tabs. Background preview rendering is independent
of agent activity. `src/project-runtime.mjs` projects ownership/capabilities/state
for UI and agent context; retain legacy flags/statuses for existing consumers.

Workspace assets/skills/instructions/projects are portable. Credentials, provider
engines, SDK caches and render workers are device-local. The agent must not mutate
project.json directly. The single in-app workflow skill is `app/video-project`.

## Mac implementation work

1. **Provider provisioning — `src/runtime-manager.mjs`.** It currently rejects
   non-Linux platforms. Add Darwin CPU-specific official artifacts, checksums and
   the matching Codex code-mode companion. Verify first-connect download, cancellation,
   retry, browser login, model listing and one real user-authorized subscribed turn.
   The app must start disconnected; do not inherit this agent's credentials/config.

2. **Runtime selection — `src/bundled-engine.mjs`, `desktop.cjs`, `engine-status.mjs`.**
   Installed apps select `runtime/manifest.json`, validate platform/CPU and set private
   SDK/cache/worker-base paths. Checkout mode is separate. Extend this for an actual
   Darwin SDK/FFmpeg/runtime; Linux binaries cannot be reused. Runtime files inside
   a signed .app must remain immutable; writable compiler caches belong in app data.
   No end-user SDK/PATH/Pub-cache assumption. Decide whether automatic provisioning
   or bundling is simpler on Mac and retain exact versions, hashes and licenses.

3. **Worker adapter — `src/playground.mjs`.** It hardcodes Bubblewrap, Linux `/usr`,
   GNU `cp --reflink=auto`, process-group cancellation and virtual paths `/work`,
   `/sdk`, `/cache`, `/runtime/fluvie`, `/toolkit`, `/app-skills`, `/skills`.
   Introduce a Mac execution/path/isolation adapter; translate manifests, pubspec
   dependencies, capture harness arguments and asset paths consistently. Do not
   merely remove bwrap or use unrestricted host execution as a fallback. Verify
   offline networking, credential/profile exclusion, read-only originals, permitted
   output roots and process-tree cancellation. Preserve the working Linux adapter.
   Evaluate containment on the actual OS; no particular Mac sandbox mechanism has
   been selected or validated by this handover.

4. **Actual .app/DMG.** `scripts/package-linux.py` is a Linux reference, not a portable
   packager. Preserve the toolkit folder layout expected by relative imports, child
   services, fonts, components and skills. Include production JS dependencies and
   built `apps/local-editor/dist`. Electron's bundled Node launches child services;
   no system Node should be needed. Preserve the existing app profile identity
   (`CMRX Chat Editor`) and projects across upgrades. Support the actual Mac CPU;
   explicitly report whether the other CPU is tested or unsupported.

5. **Automatic native requirements.** If a native compiler/SDK is truly required,
   provision it through a normal graphical OS flow or avoid that requirement with
   an appropriate prebuilt runtime. Do not replace manual terminal setup with an
   unexplained Homebrew/Xcode dependency. Do not accept licenses or make purchases
   on the user's behalf. Keep independent build work moving if signing credentials
   or enrollment are missing.

## Packaging lessons already found

- The app must ship executable code and the render toolchain, not just source or
  a launcher. Provider CLI provisioning alone did not meet the original goal.
- Bootstrap public Flutter packages **outside** PUB_CACHE: Dart refuses operating
  on a package inside its cache. Stage the prepared source afterward.
- Linux runtime uses a derived Fluvie root workspace containing fluvie, fluvie_lints,
  fluvie_lints/example, fluvie_cli, fluvie_media and fluvie_validate. The nested lints
  example is necessary. This avoids unrelated upstream editor/demo Git dependencies.
  Framework package sources stay intact. Reassess required members for Mac.
- Package only tracked Fluvie source and public hosted package roots, never developer
  credentials, whole home directories or arbitrary Git caches. Retain licenses.
- `scripts/verify-linux.mjs` demonstrates a fresh-HOME, bundled-Electron rendering
  check. Port the validation intent rather than treating it as Mac coverage.

## Required acceptance and deliverable

Test the exact installed candidate, preferably with a fresh macOS account or clean
machine and ordinary launch environment:

- Launch from Applications with no development toolchain/profile dependency.
- Guided provider connection, real user sign-in and one subscribed agent turn.
- Create an empty project; script collaboration and reopen/persistence.
- Import a 20-second user-approved or synthetic video; preserve originals and quality.
- Author genuinely new Flutter/painter/shader code, add separate timeline layers,
  render and inspect actual encoded frames/audio/duration/resolution.
- One player, seeking/backward seeking, minor cuts, mute/hide inspection and timed
  comments. Queue by default; explicit Steer only where supported.
- Cancel while waiting/rendering; tab switching; restart does not replay active work
  or remote side effects. No credential/network/original-file escape from the worker.
- Verify signing/notarization/Gatekeeper/quarantine on the downloaded installed
  candidate before calling it ready for friends. Do not bypass those protections.

Use the deployment skill's full acceptance matrix and signature checks. Keep private
profiles/media and test outputs in a named task cache, not Git or release assets.
Report artifact paths/hashes, exact app/runtime versions, macOS/CPU coverage,
auth/render/isolation/signing outcomes and remaining blockers. Prepare/build/test
is authorized; this handover does not authorize creating tags or publishing a release.

## Recording acceptance added 2026-11-10

Read RECORDING.md. Package `NSCameraUsageDescription` and
`NSMicrophoneUsageDescription` in the main app Info.plist before signing. Test OS
Screen Recording permission, camera device selection, microphone permission,
cancel/deny/retry, source-ended stopping and quit/save with the installed signed app.
Verify independent WebM/WEBA sources in project assets and approximate clock offsets.
The synthetic native recorder test does not validate Apple's permissions, actual
capture or global shortcuts. No system audio is requested by this feature.
