# Signing, notarization and GitHub distribution

Use the current official references below and the installed tools' help when
options differ. This is direct Developer ID distribution, not Mac App Store
submission. Do not change the app's full-agent capability to fit App Store rules.

## One-time Apple setup

The operator enrolls in the Apple Developer Program if needed, creates a Developer
ID Application certificate with its matching private key, and installs it in their
Mac Keychain. An Apple Development/ad-hoc identity is not the production identity.
Use an existing organization/team and bundle ID when available. A separate installer
certificate is relevant if choosing signed PKG distribution; DMG is the default
candidate format here. Enrollment/account ownership may require the user, but
independent implementation and local testing should proceed while setup is pending.

Use `security find-identity -v -p codesigning` to select the intended installed
identity locally. Prefer a dedicated notarization Keychain profile. Interactive
`xcrun notarytool store-credentials "$CMRX_NOTARY_PROFILE"` lets the operator supply
credentials directly; alternatively use a secure tool-delivered App Store Connect
key and the installed notarytool authentication options. Never request credentials
in chat or print key contents. No secrets belong in public config, workspace.yaml,
release logs or command tracing. Do not export private keys unless CI setup is
actually requested.

Source: [Apple Developer ID](https://developer.apple.com/developer-id/),
[Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution),
[Electron signing configuration](https://www.electronforge.io/guides/code-signing/code-signing-macos).

## Build and sign the app

Use the implemented packager's pinned commands and macOS signing integration.
Package Electron helpers/frameworks and required native executables with correct
architecture, stable identifiers, hardened runtime, secure timestamp and only the
entitlements actually needed. Let the signing tool handle nested code inside-out;
`codesign --deep` is a verification option, not a substitute for a correct signing
pipeline. Electron/JIT and the authoring/render runtime may need different
entitlements; do not disable hardened runtime or broadly grant privileges just to
silence an error. Preserve verified third-party signatures/rights where required.

Record the public source commit, package/lock versions, bundle ID, CPU/minimum OS,
Electron/provider/render runtime versions and entitlement choices. A source-tree
launch or success on a developer Mac does not satisfy packaged acceptance.

## Notarize and staple before final hashes

Have the agent set nonsecret task variables to real candidate paths: CMRX_APP,
CMRX_DMG, CMRX_SIGN_IDENTITY, CMRX_NOTARY_PROFILE, CMRX_BUNDLE_ID and
CMRX_RELEASE_DIR and CMRX_TEAM_ID. They are not credentials or placeholders to commit. Prefer the
packager's notarization integration if it already signs/staples correctly. Otherwise
use this explicit app-first sequence (an already accepted/stapled app need not be
submitted again):

```bash
codesign --verify --deep --strict --verbose=2 "$CMRX_APP"
ditto -c -k --sequesterRsrc --keepParent "$CMRX_APP" "$CMRX_RELEASE_DIR/app-notarization.zip"
xcrun notarytool submit "$CMRX_RELEASE_DIR/app-notarization.zip" --keychain-profile "$CMRX_NOTARY_PROFILE" --output-format json
```

Record the submission ID. Submission success is not acceptance. Inspect status with
`xcrun notarytool info "$CMRX_NOTARY_ID" --keychain-profile "$CMRX_NOTARY_PROFILE" --output-format json`.
Use normal asynchronous tool execution/status checks and progress updates while
waiting. Do not resubmit the same candidate merely because it is pending. On
rejection, fetch `notarytool log`, diagnose the reported executable/entitlement,
fix/rebuild and retain the old submission ID. Do not publish rejected/pending builds.
After Accepted:

```bash
xcrun stapler staple "$CMRX_APP"
xcrun stapler validate "$CMRX_APP"
spctl --assess --type execute --verbose=4 "$CMRX_APP"
```

Now make the DMG from that final stapled app, ideally with the selected packager.
For a simple fallback use a new task-owned staging folder containing a copy of the
app plus an Applications shortcut, then `hdiutil create -format UDZO -srcfolder ...`;
never use a source folder that contains signing material or real projects.
Sign the resulting container with `codesign --sign "$CMRX_SIGN_IDENTITY" --timestamp "$CMRX_DMG"`.
Submit that DMG with notarytool, record its separate ID and wait for Accepted before
`xcrun stapler staple "$CMRX_DMG"`. This two-stage path avoids rebuilding a DMG
after changing the enclosed app. If the packager uses a different valid sequence,
verify both final tickets rather than blindly repeating this one.

Run `scripts/verify-macos.sh`, then compute SHA-256 for each final installer. A
stapling/signing/build change invalidates earlier candidate hashes and acceptance;
verify the new exact artifact. Keep notarization ZIPs private to the task cache,
not as the friend-facing installer.

Source: [Apple custom notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).

## Validate, commit and release

Run the [acceptance matrix](acceptance.md). Before remote release actions, ensure
source provenance and native artifact identity agree. Commit/push public toolkit
changes before recording its pointer in Studio. Do not tag a dirty source tree or
include unrelated edits. Use `desktop-vX.Y.Z`; match package.json, lockfile and the
app's CFBundleShortVersionString. Never move an existing tag or overwrite a
published same-version installer with different bytes. Resolve a collision by
inspecting it; a different build needs a new agreed version.

The existing tag workflow creates a source-only draft. Implement a coordinated Mac
release job or upload to that same draft after it exists; never race two `gh release
create` calls. A prepare-only run creates no tag/draft. For an authorized draft or
publication, verify effective GitHub identity, canonical repository and write
access, push the exact source tag, then create/reuse that tag's draft. Include
architecture-labeled DMG(s), a SHA256SUMS file, concise install instructions, real
platform coverage and known limits. Keep friend previews as prereleases unless
instructed otherwise. Exclude private reports/profiles and secrets.

Use structured arguments or a notes file for gh release text. Read back the draft:

```bash
gh release view "$CMRX_TAG" --repo ChrisMarxDev/cmrx-video-toolkit --json tagName,isDraft,assets,url
```

Compare the remote tag commit to the recorded source, download each installer to a
new task folder, check SHA-256 and perform final downloaded-artifact acceptance.
For an explicitly authorized publish, mark that verified draft public; then read
back public asset URLs and checksums. A missing clean-Mac result must remain a
reported release blocker, not a passing checkbox. Do not delete a published release
as rollback; report the issue and prepare a new fixed version.

For CI, put certificates and notary authentication in repository/environment secrets,
import into a temporary Keychain, and clean up even on failure. Preserve the user's
original Keychain/search-list configuration on a self-hosted Mac. Do not blindly
copy iOS provisioning steps into Developer ID distribution; use only the entitlements
and profiles the chosen Mac app actually needs. A permanently attached MacBook is
not required once the macOS runner and credentials are configured.
Source: [GitHub macOS signing runners](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications).
