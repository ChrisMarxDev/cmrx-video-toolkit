#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
venv_dir="${VIDEO_TOOLS_VENV:-.tools/video-tools-venv}"
if [[ ! -x "$venv_dir/bin/python" ]]; then
  "${VIDEO_TOOLS_PYTHON:-python3}" -m venv "$venv_dir"
fi
"$venv_dir/bin/python" -m pip install -r video_tools/requirements.txt
mkdir -p .tools/video-models
model=.tools/video-models/rvm_mobilenetv3_fp32.onnx
if [[ ! -f "$model" ]]; then
  curl -fL --retry 4 --connect-timeout 30 -o "$model.part" https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx
  mv "$model.part" "$model"
fi
"$venv_dir/bin/python" - <<'PY'
import hashlib
from pathlib import Path
p=Path('.tools/video-models/rvm_mobilenetv3_fp32.onnx')
assert hashlib.sha256(p.read_bytes()).hexdigest() == '88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828', 'Model checksum mismatch'
print('Video tools model verified.')
PY
