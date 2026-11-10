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

The first stage is deliberately a source preview. Linux development and rendering
are tested locally. The Linux installer candidate below adds a bundled SDK, but
Apple Silicon packaging and signing now have maintainer commands in
[MACOS_BUILD.md](MACOS_BUILD.md). Final Mac installer acceptance remains a
release gate; there is no unattended updater yet. Do not label these archives as
clean-machine installers. The existing app name/profile path stays stable so moving
source does not discard projects or connections.

## Prepare and review

1. Update the desktop package and lockfile versions together. Record user-facing
   changes and known platform limits in `RELEASE_NOTES.md`.
2. Run `make desktop-install desktop-check` from a clean public checkout. Exercise
   first-run connection, empty creation, video import, commenting and a Flutter
   render on a real desktop. Record which platforms were actually tested.
3. Commit and push to the normal branch. Create and push the matching tag, e.g.:

   ```sh
   git tag desktop-v0.1.0
   git push origin desktop-v0.1.0
   ```

4. The desktop release workflow validates the tag/version, installs locked
   dependencies, builds and tests, and prepares a draft prerelease with a public
   source archive and SHA-256 checksum. Review the draft before publishing it.
   A failed test must not be bypassed by uploading an unverified archive.

Tagging is a separate release action; ordinary source commits do not release.
Existing tags must never be moved. Release notes must describe requirements, not
promise bundled runtimes. The archive contains tracked public toolkit source only,
including the components needed by the desktop worker; it excludes local projects,
profiles, caches and node_modules. Users still install the documented requirements.

## Installer follow-up

Before friendly-user binary releases, implement independently versioned render
runtime bundles, Linux/macOS native packaging, platform-specific worker isolation,
clean-machine acceptance and signing/notarization where applicable. A lightweight
GitHub release check should filter `desktop-v` releases and offer an explicit
Download action; it must not confuse toolkit releases with app updates. This check
is not implemented by this extraction.

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
