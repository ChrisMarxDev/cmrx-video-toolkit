#!/bin/bash
set -euo pipefail
if ! command -v whisper-cli >/dev/null 2>&1; then
  HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_UPGRADE=1 brew install whisper-cpp
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_UPGRADE=1 brew install ffmpeg
fi
model_dir="$HOME/Library/Application Support/flut_script/models"
mkdir -p "$model_dir"
if [ ! -s "$model_dir/ggml-base.bin" ]; then
  curl --fail --location --retry 3 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin' -o "$model_dir/ggml-base.bin.part"
  mv "$model_dir/ggml-base.bin.part" "$model_dir/ggml-base.bin"
fi
printf 'Whisper model ready: %s/ggml-base.bin\n' "$model_dir"

printf 'Run: WHISPER_MODEL="%s/ggml-base.bin" python3 apps/editor/server.py\n' "$model_dir"
