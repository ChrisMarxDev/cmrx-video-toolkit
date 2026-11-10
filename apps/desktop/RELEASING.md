# Desktop releases

The toolkit repository owns app source, issues, releases and the
[desktop-deploy skill](.agents/skills/desktop-deploy/SKILL.md). On your Mac, open
`apps/desktop` in your coding agent and use `$desktop-deploy` to prepare a candidate.
The skill includes first-time Mac support work and later signing/release steps.
Use `make desktop-deploy-check` or `make desktop-deploy-preflight` from the toolkit
root for its helpers; preflight exits 2 when Mac requirements are missing.

Desktop tags use
`desktop-vX.Y.Z`; do not reuse a toolkit tag. The version in
`apps/desktop/package.json` and its lockfile must match the tag.

## Mac release

The Apple Silicon app bundles its rendering dependencies. Maintainers use the
[repeat-release procedure](.agents/skills/desktop-deploy/references/repeat-release.md)
for cached inputs, signed packaging, resumable app/DMG notarization, the existing
source-tag draft workflow, exact downloaded-installer acceptance and publication.
Friends download the DMG from [desktop releases](https://github.com/ChrisMarxDev/cmrx-video-toolkit/releases),
install through Finder and connect their own account inside the app. They do not
run maintainer commands or install Flutter/Node/FFmpeg themselves.

Version package.json and its lockfile together, commit the reviewed source and
freeze its exact commit. Desktop tags are immutable. The tag workflow creates a
source-only draft; add the signed/notarized installer and corresponding-source
archive to that same draft. An ordinary source commit does not release an app.
Do not publish until downloaded-artifact acceptance passes. State actual OS/CPU
coverage and remaining untested configurations; there is no unattended updater.

## Debian/Ubuntu amd64 candidate

`make desktop-package-linux PACKAGE_DIR=/absolute/new-output
FLUTTER_SDK=/absolute/pinned-sdk PUB_CACHE_DIR=/absolute/builder-cache` produces a
native `.deb`. SDK and cache paths are **builder inputs only**. The installed app
includes Electron 43.0.0, Flutter 3.47.7/Dart, the pinned Fluvie source and offline
package sources; native system dependencies are declared for the graphical package
installer to resolve. The app launcher uses the packaged engine without user PATH,
Flutter or Pub-cache configuration. The compiler remains capable of new arbitrary
Flutter source, not only predefined graphics.

This first target is Debian/Ubuntu on AMD64; it is not a macOS, ARM or universal
Linux installer. Native package installation may ask for administrator permission
and needs repository access to fetch dependencies. Do not ask end users to run the
maintainer build commands above.

Verify an installed/unpacked candidate with `make -C apps/desktop
verify-linux-package LINUX_APP_DIR=/path/to/application
PACKAGE_TEST_DIR=/absolute/new-test-output`. It uses the bundled Electron runtime,
a fresh HOME, isolated SDK/cache, actual authored graphics plus footage/audio, and
checks encoded duration/resolution/audio and decoding. It does not authenticate a
real model account or prove that a GUI package manager resolves dependencies.

The manually dispatched `Installed Linux desktop candidate` CI workflow removes
builder toolchains, installs the actual `.deb` using the OS dependency resolver,
then runs the installed-app rendering check. Passing local smoke tests alone does
not establish clean Ubuntu installation. No new tag or release is created by it.
Existing source-tag releases remain separate until installer acceptance passes.
