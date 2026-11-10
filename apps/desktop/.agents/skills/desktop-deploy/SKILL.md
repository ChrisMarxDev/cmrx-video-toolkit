---
name: desktop-deploy
description: Prepare, build, sign, notarize and release the CMRX Video Toolkit desktop app on macOS, including implementing missing Mac runtime support and checking a clean-machine video workflow. Use for this app's release engineering, not publishing videos.
---

# Desktop deployment

Deliver a working Mac download of the toolkit desktop video app, preserving arbitrary
Flutter/Fluvie authoring. A signed window without working provider login and video
rendering is not a successful deployment.

## Locate and choose scope

This app-owned skill ships at `apps/desktop/.agents/skills/desktop-deploy/` in the
public toolkit. It is release engineering guidance, separate from the video-editing
agent's creator catalog. Locate the toolkit root containing `apps/desktop/package.json`
and `apps/local-editor/`, from the current checkout or a supplied path. Read its
AGENTS.md, `apps/desktop/{README,RELEASING,WORKSPACES}.md`,
`docs/EXTERNAL-REQUIREMENTS.md` and current Git status/history. Follow the host's
repository rules; standalone deployment does not depend on a private Studio checkout.

- **Prepare/build/test**: produce validated local candidates and a release report;
  do not create remote tags, upload candidates or publish releases.
- **Draft release**: additionally create/reuse the exact-version draft and upload
  verified artifacts, when requested. A public tag is also an external release
  action; this mode authorizes it only for the agreed version/commit.
- **Publish/release version X**: finish preparation, draft/readback and publish that
  release. Existing authorization is sufficient; do not add a second approval gate.

If intent is simply “deploy”, prepare the complete reviewable candidate first and
resolve only missing release intent/version before external release actions. Do not
ask for credentials or signing decisions before completing independent code/build
work. Creating/editing this skill does not execute any deployment.

## Repeat releases quickly

For an implemented Mac app, start with [repeat release](references/repeat-release.md):
reuse pinned builder inputs and frozen candidates, check Keychain authentication
before expensive work, and use `make desktop-notarize` for locked, resumable Apple
submissions. Keep version/source, app and DMG paths, submission IDs, final hashes,
coverage and GitHub assets in a task-owned release receipt outside the checkout.
Inspect existing state/processes before doing work; never duplicate a live upload.
Read the readiness reference only when implementing support or diagnosing a gap.

## Run the flow

1. Read [Mac readiness](references/mac-readiness.md). Run
   `node <skill>/scripts/preflight.mjs --repo <toolkit>`. Exit 2 means blockers, not
   a successful Mac build. On Linux, inspect/implement portable changes but do not
   claim Mac signing or GPU acceptance. If the user names a remote Mac, use available
   linked-environment tools; do not invent SSH credentials or silently switch hosts.
2. Implement missing provider/runtime, packaging and worker support when authorized
   by the deployment task. Read [acceptance](references/acceptance.md) before design
   choices so fixed templates or host-installed dev tools do not fake completion.
3. Once a functional packaged build exists, follow
   [signing and distribution](references/signing-release.md) for Developer ID,
   hardened runtime, notarization, final DMG, release identity and publication.
4. Test the exact downloaded/installed candidate with the acceptance matrix. Run
   `bash <skill>/scripts/verify-macos.sh <app> <bundle-id> <team-id> [dmg]` for signature/ticket
   checks; this does not replace behavioral tests. Pin output hashes after final
   stapling; never modify or re-sign a verified release artifact afterward.
5. Return artifact paths/download links, version/commit/runtime versions, CPU/macOS
   coverage, signature/notary results and remaining blockers. Keep a machine-readable
   or Markdown report in a named task cache. Never call source archives installers.

Use existing secure Keychain profiles or a secret-input tool for sensitive material;
never ask for Apple passwords, private keys or certificates in chat. Keep deployment
credentials outside project workspaces and public artifacts. Stop only dependent
sign/publish work for missing enrollment, credentials, an unresolved rejection or
failed acceptance; retain the useful candidate and continue independent fixes.
