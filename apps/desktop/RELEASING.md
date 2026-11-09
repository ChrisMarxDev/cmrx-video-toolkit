# Desktop releases

The toolkit repository owns app source, issues and releases. Desktop tags use
`desktop-vX.Y.Z`; do not reuse a toolkit tag. The version in
`apps/desktop/package.json` and its lockfile must match the tag.

The first stage is deliberately a source preview. Linux development and rendering
are tested locally; there is no bundled Flutter/media sandbox runtime, signed macOS
app, notarization or unattended updater yet. Do not label these archives as
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
