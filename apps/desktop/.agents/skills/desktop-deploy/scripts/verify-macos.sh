#!/usr/bin/env bash
# Verify existing final artifacts only; do not sign, staple, launch, or upload anything.
set -euo pipefail
if [[ "${1:-}" == --help ]]; then
  echo 'Usage: verify-macos.sh /path/App.app expected.bundle.id TEAM_ID [/path/installer.dmg]'
  exit 0
fi
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'Mac artifact verification requires macOS; no verification performed.' >&2
  exit 2
fi
if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo 'Expected App.app, bundle ID, Apple Team ID and optional DMG.' >&2
  exit 2
fi
cmrx_verify_app=$1
cmrx_verify_id=$2
cmrx_verify_team=$3
[[ -d "$cmrx_verify_app" && "$cmrx_verify_app" == *.app ]] || { echo 'Missing .app bundle' >&2; exit 2; }
cmrx_actual_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$cmrx_verify_app/Contents/Info.plist")
[[ "$cmrx_actual_id" == "$cmrx_verify_id" ]] || { echo 'Bundle ID differs from release identity' >&2; exit 1; }
codesign --verify --deep --strict --verbose=2 "$cmrx_verify_app"
cmrx_signature=$(codesign --display --verbose=4 "$cmrx_verify_app" 2>&1)
[[ "$cmrx_signature" == *'Authority=Developer ID Application:'* ]] || { echo 'App lacks a Developer ID Application signature' >&2; exit 1; }
cmrx_actual_team=$(printf '%s\n' "$cmrx_signature" | /usr/bin/sed -n 's/^TeamIdentifier=//p')
[[ "$cmrx_actual_team" == "$cmrx_verify_team" && -n "$cmrx_verify_team" ]] || { echo 'App Team ID differs from release identity' >&2; exit 1; }
[[ "$cmrx_signature" == *'(runtime)'* ]] || { echo 'App lacks hardened runtime' >&2; exit 1; }
xcrun stapler validate "$cmrx_verify_app"
spctl --assess --type execute --verbose=4 "$cmrx_verify_app"
if [[ $# -eq 4 ]]; then
  cmrx_verify_dmg=$4
  [[ -f "$cmrx_verify_dmg" && "$cmrx_verify_dmg" == *.dmg ]] || { echo 'Missing DMG' >&2; exit 2; }
  codesign --verify --verbose=2 "$cmrx_verify_dmg"
  cmrx_dmg_signature=$(codesign --display --verbose=4 "$cmrx_verify_dmg" 2>&1)
  [[ "$cmrx_dmg_signature" == *'Authority=Developer ID Application:'* ]] || { echo 'DMG lacks a Developer ID Application signature' >&2; exit 1; }
  cmrx_dmg_team=$(printf '%s\n' "$cmrx_dmg_signature" | /usr/bin/sed -n 's/^TeamIdentifier=//p')
  [[ "$cmrx_dmg_team" == "$cmrx_verify_team" ]] || { echo 'DMG Team ID differs from release identity' >&2; exit 1; }
  xcrun stapler validate "$cmrx_verify_dmg"
  hdiutil verify "$cmrx_verify_dmg"
  shasum -a 256 "$cmrx_verify_dmg"
fi
printf '%s\n' 'Signature/ticket checks passed. Native installed/downloaded-app acceptance is still required.'
