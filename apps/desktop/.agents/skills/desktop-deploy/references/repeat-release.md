# Repeat a Mac release

Use the existing packaged candidate when its version, clean source receipt and
runtime inputs still match the agreed release. A later tooling/docs commit does
not require rebuilding an already frozen candidate. Never change a published
installer; app/icon changes require a new version.

## Persistent local state

Use `~/Library/Application Support/CMRX Deployment/` (directory mode 700), outside
all repositories. `config.json` (mode 600) records `profile`, explicit `keychain`,
`team_id`, `sign_identity`, `credentials_file`, `release_root`, `active_release`,
source and version. Initialize it with operator-approved nonsecret identity values
using `scripts/deploy_config.py`'s `save_private`, then keep release artifacts,
receipts, logs and submission IDs under `release_root`, never only `/private/tmp`.
The active release receipt remains authoritative; read it before starting work.

With operator authorization to retain credentials, run
`make desktop-deploy-configure CONFIG_DIALOG=1` from the toolkit root for native
local entry, or omit CONFIG_DIALOG for a maintainer Terminal prompt. This takes the
EXISTING app-specific password, never asks the operator to generate a replacement,
and saves it in the private `credentials_file` with owner-only mode 600. The backup
is plaintext protected by filesystem permissions, not an encrypted vault. Do not
read/print its contents, copy it into Git, publish it, or put secrets in command
arguments/logs. Respect host UI permission and announce Keychain prompts first.

Notarization loads the saved profile and explicit Keychain automatically; callers
may override --profile/--keychain deliberately. If profile lookup fails with exit69
and a private credential backup exists, it restores that same profile through the
secure password prompt, validates access and resumes. Passwords never enter argv
or logs. Missing/invalid backups block dependent work without deleting artifacts,
repeated dialogs, new passwords or duplicate uploads. A valid profile never reads
the backup. Symlinks, foreign-owned or group/world-readable config files are refused.

When migrating a release directory, copy it intact, verify ZIP/DMG hashes, update
only external receipt paths and active_release, and preserve submission IDs and
CDHashes. Never rewrite signed app contents. Don't delete the original until the
migration is verified. Avoid opening credential setup automatically on every run.

## Fast preparation

Keep pinned SDK, offline Pub cache and static-media build receipts outside the
checkout. Reuse them while their revisions/hashes match MACOS_BUILD.md and the
packager; do not rebuild FFmpeg or download Flutter on every release. Use a new
candidate output directory each time. Install locked npm dependencies when the
lockfile changes; source packaging still performs the required editor build.

Before a release build, check `security find-identity -v -p codesigning` and
`xcrun notarytool history --keychain-profile "$CMRX_NOTARY_PROFILE" --output-format json`.
Warn the operator before possible Keychain prompts. An absent profile blocks
notarization only: retain builds and continue independent checks. Create credentials
only through an authorized secure local setup; never place them in config/chat.

From the toolkit root, with actual absolute paths assigned by the agent:

```sh
make desktop-deploy-preflight desktop-deploy-check desktop-check
make desktop-package-macos PACKAGE_DIR="$CMRX_CANDIDATE" FLUTTER_SDK="$CMRX_SDK" PUB_CACHE_DIR="$CMRX_PUB_CACHE" MEDIA_BIN="$CMRX_MEDIA_BIN"
make desktop-sign-macos MAC_APP="$CMRX_APP" CMRX_SIGN_IDENTITY="$CMRX_SIGN_IDENTITY"
make desktop-verify-macos MAC_APP="$CMRX_APP" PACKAGE_TEST_DIR="$CMRX_RENDER_TEST"
ditto -c -k --sequesterRsrc --keepParent "$CMRX_APP" "$CMRX_RELEASE_DIR/app-notarization.zip"
make desktop-notarize NOTARY_ARTIFACT="$CMRX_RELEASE_DIR/app-notarization.zip" NOTARY_TARGET="$CMRX_APP" NOTARY_STATE="$CMRX_RELEASE_DIR/app-notary-state.json" CMRX_NOTARY_PROFILE="$CMRX_NOTARY_PROFILE"
```

The notarization helper submits once and checks once. The Python helper exits 3
for pending review; the Make wrapper reports it as a successful pending check. Later
run the identical command to resume, without recreating the ZIP. Exit 2 means an
error requiring diagnosis. State files contain paths, hashes and Apple IDs, never
credentials. One lock prevents concurrent commands for the same receipt; all
operators must share that receipt, not create another state file for the artifact.
A timeout during submit records `submitting`: inspect Apple history and recover
with `NOTARY_ID=...` after checking that submission's identity, rather than retrying
an upload. Do not poll in a tight loop or create recurring chat prompts.

When accepted, the helper validates/staples the app. Then:

```sh
make desktop-macos-dmg MAC_APP="$CMRX_APP" MAC_DMG="$CMRX_DMG"
codesign --sign "$CMRX_SIGN_IDENTITY" --timestamp "$CMRX_DMG"
make desktop-notarize NOTARY_ARTIFACT="$CMRX_DMG" NOTARY_TARGET="$CMRX_DMG" NOTARY_STATE="$CMRX_RELEASE_DIR/dmg-notary-state.json" CMRX_NOTARY_PROFILE="$CMRX_NOTARY_PROFILE"
```

Resume that second command until accepted. Both app and DMG have separate Apple
submission IDs. Run `verify-macos.sh` on both, then hash the final DMG and matching
media corresponding-source archive into SHA256SUMS. Do not staple/sign after final
hashes. If interrupted during DMG stapling, changed bytes cause a conservative stop:
validate the ticket/signature and reconcile the receipt manually, never resubmit.

## Draft, downloaded acceptance, publish

Follow [signing-release.md](signing-release.md) for exact tag/source checks and
[acceptance.md](acceptance.md) for actual test coverage. Before upload, inspect
running processes/task state and `gh release view`; do not duplicate an active
upload. Push the frozen `desktop-vX.Y.Z` tag only when draft/public release work is
authorized. Wait for the existing desktop.yml workflow to create its source draft;
inspect failed workflow runs rather than racing a second release creation.

Upload the DMG, matching media corresponding-source archive and final SHA256SUMS
to that draft. Include the workflow's source-archive hash when replacing its
SHA256SUMS; never upload notarization ZIPs or private receipts. `--clobber` is
appropriate only for a reviewed draft checksum update, never published assets.
Read back asset names, sizes, digests and remote tag commit. Download to a new
folder and verify every final checksum. Then actually download through a browser,
install using Finder's Applications shortcut, eject and launch the installed app
with quarantine preserved. Coordinate UI use and warn about normal Open/admin
prompts before installation. Test rendering with isolated dependencies and check
app/Dock/About/mounted-volume branding; standard unmounted-DMG file-type icons are
OS behavior. Record concrete OS/CPU/login/export coverage and untested platforms.

For an authorized publication after passing acceptance:

```sh
gh release edit "$CMRX_TAG" --repo ChrisMarxDev/cmrx-video-toolkit --draft=false --prerelease --notes-file "$CMRX_NOTES"
gh release view "$CMRX_TAG" --repo ChrisMarxDev/cmrx-video-toolkit --json tagName,isDraft,isPrerelease,assets,url
```

Read back public URLs and hashes. Update public download documentation and durable
release evidence, commit/push normally, then stop any release monitor. Apple service
waiting time cannot be eliminated by build caching; retain its exact submission ID.
