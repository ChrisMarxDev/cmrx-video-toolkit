#!/bin/bash
set -euo pipefail
if [ "$#" -lt 1 ]; then
  printf 'Usage: bash tool/open.sh /absolute/video.mp4 [workspace-directory]\n' >&2
  exit 64
fi
video_path="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
workspace_path="${2:-$video_path.flut_script}"
mkdir -p "$(dirname "$workspace_path")"
workspace_path="$(cd "$(dirname "$workspace_path")" && pwd)/$(basename "$workspace_path")"
model_path="${WHISPER_MODEL:-$HOME/Library/Application Support/flut_script/models/ggml-base.bin}"
cd "$(dirname "$0")/.."
dart run tool/prepare.dart "$video_path" "$workspace_path" "$model_path"
flutter run -d macos --dart-define="FLUT_SCRIPT_WORKSPACE=$workspace_path"
