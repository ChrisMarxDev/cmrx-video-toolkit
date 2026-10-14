#!/usr/bin/env bash
set -euo pipefail
editor_dir="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$#" -gt 1 ]; then
  exec python3 "$editor_dir/server.py" "$1" --workspace "$2"
fi
exec python3 "$editor_dir/server.py" "$@"
