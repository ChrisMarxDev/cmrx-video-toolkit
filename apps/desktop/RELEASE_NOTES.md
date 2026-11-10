# 0.1.2 — current-source candidate

- Restore saved device-provider connections across app restarts.
- Place folder opening beside the asset-browser breadcrumb.
- Include resumable Mac deployment helpers and corrected cross-version audio checks.

This candidate is a local build until its own notarization and downloaded-installer
acceptance are complete. It does not replace the frozen 0.1.1 candidate.

# 0.1.1 — complete application branding

- Use the approved CMRX dithered split-disc mark in Finder, the Dock, the About panel and runtime windows.
- Brand the mounted installer volume with the same mark.
- Give the Mac app menu explicit CMRX naming and real release/issue links.
- Preserve the existing signed 0.1.0 release; this update is a new artifact.

The unmounted DMG may use macOS's standard disk-image file-type icon. The app and mounted installer contain the approved artwork, with no Electron/default or generated placeholder branding.

Desktop developer preview: local projects and tabs, subscription-backed providers,
one composited video player, editable graphics clips, timed comments, assets,
project skills and generic MCP/HTTP connections.

Apple Silicon Mac packages bundle the rendering toolchain. GitHub source archives
are separate from installers. See each published release for its actual native
acceptance coverage and known limits. There is no automatic updater.
