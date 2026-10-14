# Source this file from any directory; no global shell configuration is modified.
agentic_videos_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$agentic_videos_root/.tools/flutter/bin:$HOME/.pub-cache/bin:$PATH"
unset agentic_videos_root
