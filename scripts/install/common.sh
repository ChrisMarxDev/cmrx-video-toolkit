#!/bin/bash
# macOS's built-in Bash 3.2 is supported. Run as the normal user, never sudo bash.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_SCRIPT="${INSTALL_SCRIPT:-$ROOT/install.sh}"
STEP=preflight
HINT='Read the failed command and log, repair that prerequisite, then rerun this script.'
CHECK_ONLY=0
MODIFY_PATH=1
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --no-modify-path) MODIFY_PATH=0 ;;
    --help) printf 'Usage: bash install.sh [--check] [--no-modify-path]\n--check checks tools without installing or downloading.\nCMRX_INSTALL_HOME selects the managed environment/log directory.\n'; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done
fail() { printf '\nERROR [%s]: %s\nRecovery: %s\nLog: %s\nRetry: /bin/bash %q\n' "$STEP" "$1" "$HINT" "${LOG:-not started}" "$INSTALL_SCRIPT" >&2; exit 1; }
on_error() {
  local status="$1" line="$2" command="$3" source_file="$4"
  trap - ERR
  if [[ "$command" == '"$@"' ]]; then command="${LAST_COMMAND:-$command}"; fi
  printf '\nINSTALLATION FAILED\nStep: %s\nExit code: %s\nSource: %s\nLine: %s\nCommand: %s\nRecovery: %s\nLog: %s\nRetry: /bin/bash %q\nCompleted tools are checked and reused on retry. No automatic rollback was attempted.\n' "$STEP" "$status" "$source_file" "$line" "$command" "$HINT" "${LOG:-not started}" "$INSTALL_SCRIPT" >&2
  exit "$status"
}
trap 'on_error "$?" "$LINENO" "$BASH_COMMAND" "${BASH_SOURCE[0]}"' ERR
run() { LAST_COMMAND="$(printf '%q ' "$@")"; printf '\n+ %s\n' "$LAST_COMMAND"; "$@"; }
step() { STEP="$1"; HINT="$2"; printf '\n=== %s ===\n' "$STEP"; }
# Version checks execute the candidate, rather than trusting presence on PATH.
python_ok() { "$1" -c 'import sys,venv,ssl,ensurepip; assert (3,10) <= sys.version_info[:2] < (3,14)' >/dev/null 2>&1; }
node_ok() { "$1" -e 'if (+process.versions.node.split(".")[0] < 22) process.exit(1)' >/dev/null 2>&1; }
flutter_ok() {
  # Cold Flutter bootstrap can write setup text before its machine JSON.
  "$1" --version --machine | "$PYTHON" -c '
import json,sys
raw=sys.stdin.read(); data=None; decoder=json.JSONDecoder()
for i,char in enumerate(raw):
    if char != "{": continue
    try: obj,_=decoder.raw_decode(raw[i:])
    except json.JSONDecodeError: continue
    if isinstance(obj,dict) and "dartSdkVersion" in obj:
        data=obj; break
if data is None:
    print("Could not parse Flutter version output:\n"+raw,file=sys.stderr); sys.exit(1)
version=tuple(map(int,data["dartSdkVersion"].split(" ")[0].split(".")[:2]))
if not (3,12)<=version<(4,0):
    print("Flutter requires Dart >=3.12,<4; found "+data["dartSdkVersion"],file=sys.stderr); sys.exit(1)
' >/dev/null
}

ffmpeg_ok() {
  command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null || return 1
  ffprobe -version >/dev/null 2>&1 || return 1
  local encoders
  encoders="$(ffmpeg -hide_banner -encoders 2>/dev/null)" || return 1
  [[ "$encoders" == *libx264* && "$encoders" == *aac* && "$encoders" == *prores_ks* ]]
}
fluvie_ok() {
  local help
  help="$("$1" render --help 2>&1)" || return 1
  [[ "$help" == *--toolchain* && "$help" == *--no-download* && "$help" == *--machine* ]] || return 1
  help="$("$1" validate --help 2>&1)" || return 1
  [[ "$help" == *--json* ]]
}

finish_install() {
  if [[ "$CHECK_ONLY" == 1 ]]; then
    step fluvie 'Install a compatible Fluvie CLI with render and validate JSON support; rerun the installer without --check.'
    command -v fluvie >/dev/null && fluvie_ok "$(command -v fluvie)" || fail 'Compatible Fluvie CLI unavailable.'
    printf '\nTool checks passed. --check does not test models, packages or an actual render.\n'; return
  fi
  step fluvie 'Inspect the pinned Fluvie checkout and Pub resolver error. Do not change existing project lockfiles or global SDKs to repair this. A failed managed clone can be moved aside and retried.'
  if ! command -v fluvie >/dev/null || ! fluvie_ok "$(command -v fluvie)"; then
    FLUVIE_REV=10e442c1bb469118516df3335547f85ec92155e6
    FLUVIE_HOME="$STATE/fluvie-$FLUVIE_REV"
    if [[ ! -d "$FLUVIE_HOME" ]]; then
      run git clone https://github.com/SimonErich/fluvie.git "$FLUVIE_HOME"
    fi
    [[ "$(git -C "$FLUVIE_HOME" remote get-url origin)" == https://github.com/SimonErich/fluvie.git ]] || fail 'Managed Fluvie checkout has an unexpected remote; inspect it before repair.'
    if [[ "$(git -C "$FLUVIE_HOME" rev-parse HEAD)" != "$FLUVIE_REV" ]]; then
      [[ -z "$(git -C "$FLUVIE_HOME" status --porcelain)" ]] || fail 'Managed Fluvie checkout has local modifications; preserve them before repair.'
      run git -C "$FLUVIE_HOME" checkout --detach "$FLUVIE_REV"
    fi
    (cd "$FLUVIE_HOME"; run flutter pub get)
    # Generate safely quoted shell paths, including spaces in Application Support.
    "$PYTHON" - "$STATE/bin/fluvie" "$(command -v dart)" "$FLUVIE_HOME/packages/fluvie_cli/bin/fluvie.dart" <<'PY'
import pathlib,shlex,sys
p=pathlib.Path(sys.argv[1]); p.write_text('#!/bin/sh\nexec '+shlex.join(sys.argv[2:])+' "$@"\n'); p.chmod(0o755)
PY
    hash -r
  fi
  fluvie_ok "$(command -v fluvie)" || fail 'Fluvie CLI does not expose required render/validate flags.'
  step packages 'Inspect the package manager error below. npm ci uses committed locks; Python packages stay in an isolated environment. Retry after repairing network, disk space or package compatibility.'
  if [[ ! -x "$ROOT/.tools/video-tools-venv/bin/python" ]]; then run "$PYTHON" -m venv "$ROOT/.tools/video-tools-venv"; fi
  python_ok "$ROOT/.tools/video-tools-venv/bin/python" || fail 'Managed venv is incompatible. Move it aside and rerun; do not delete user environments.'
  run "$ROOT/.tools/video-tools-venv/bin/python" -m pip install -r "$ROOT/video_tools/requirements.txt"
  # Reuse the existing verified matting-model setup with the managed interpreter.
  (cd "$ROOT"; export VIDEO_TOOLS_VENV="$ROOT/.tools/video-tools-venv"; run bash video_tools/setup.sh)
  for package in apps/review-agent apps/component-browser-agent tools/fal; do
    run npm --prefix "$ROOT/$package" ci
  done
  (cd "$ROOT/components"; run flutter pub get)
  step models 'Check HTTPS access to model hosts and available disk space. Existing model paths are reused. The default Whisper and RVM/evidence downloads verify checksums.'
  run "$ROOT/.tools/video-tools-venv/bin/python" - "$ROOT" <<'PY'
import sys
sys.path.insert(0,sys.argv[1]+'/apps/editor')
from models import resolve_model
print('Whisper model:',resolve_model(progress=print))
PY
  (cd "$ROOT"; run "$ROOT/.tools/video-tools-venv/bin/python" -m tools.media_evidence.setup_models --models "$STATE/models/evidence")
  step environment 'Check write permission for the managed directory and shell startup file. --no-modify-path avoids startup-file changes; source env.sh explicitly instead.'
  "$PYTHON" - "$STATE/env.sh" "$ROOT/.tools/video-tools-venv/bin" "$STATE/bin" "$PATH" <<'PY'
import pathlib,shlex,sys
pathlib.Path(sys.argv[1]).write_text('# Generated by CMRX toolkit installer\nexport PATH='+shlex.quote(':'.join(sys.argv[2:]))+'\n')
PY
  if [[ "$MODIFY_PATH" == 1 ]]; then
    # zprofile/zshrc covers login and interactive terminals, bash equivalents too.
    "$PYTHON" - "$STATE/env.sh" <<'PY'
import os,pathlib,shlex,sys
line='[ -f '+shlex.quote(sys.argv[1])+' ] && . '+shlex.quote(sys.argv[1])+' # CMRX toolkit environment'
for name in ('.zprofile','.zshrc','.bash_profile','.bashrc'):
    p=pathlib.Path.home()/name
    old=p.read_text() if p.exists() else ''
    if line not in old.splitlines():
        with p.open('a') as f: f.write('\n'+line+'\n')
PY
  fi
  source "$STATE/env.sh"
  printf '\nResolved environment (also recorded in the log):\n'
  for tool in python3 node npm flutter dart ffmpeg ffprobe whisper-cli fluvie ${EXTRA_TOOLS:-}; do
    printf '%s: %s\n' "$tool" "$(command -v "$tool")"
  done
  run python3 --version
  run flutter --version
  run ffmpeg -version
  run ffprobe -version
  native_versions
  run git -C "$ROOT" rev-parse HEAD
  step verification 'Read the smoke-test traceback and preceding renderer output. Run flutter doctor -v for native-toolchain problems. Retry this installer after repairing the reported prerequisite. A failed render is not a successful installation.'
  run "$ROOT/.tools/video-tools-venv/bin/python" "$ROOT/scripts/install/verify.py" --state "$STATE"
  printf '\nINSTALLATION VERIFIED\nEnvironment: %s/env.sh\nLog: %s\nFor a new agent shell: source %q\nToolkit: %s\nMCP registration is host-specific; follow apps/review-agent/README.md.\n' "$STATE" "$LOG" "$STATE/env.sh" "$ROOT"
}
