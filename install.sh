#!/bin/bash
# One entry point; preserve all arguments and the platform installer's exit status.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "$(uname -s)" in
  Darwin) exec /bin/bash "$root/scripts/install/macos.sh" "$@" ;;
  Linux) exec /bin/bash "$root/scripts/install/linux.sh" "$@" ;;
  *) printf 'Unsupported platform: %s. This installer supports macOS and Linux. No installation attempted.\n' "$(uname -s)" >&2; exit 2 ;;
esac
