#!/usr/bin/env bash
set -euo pipefail
unset ELECTRON_RUN_AS_NODE
app_root="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
if command -v electron43 >/dev/null; then
  exec electron43 "$app_root/src/desktop.cjs" -- "$@"
elif command -v electron >/dev/null; then
  exec electron "$app_root/src/desktop.cjs" -- "$@"
else
  echo 'Electron is required. Install Electron 43 using your Linux package manager.' >&2
  exit 1
fi
