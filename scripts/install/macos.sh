#!/bin/bash
# macOS's built-in Bash 3.2 is supported. Run as the normal user, never sudo bash.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE="${CMRX_INSTALL_HOME:-$HOME/Library/Application Support/cmrx-video-toolkit}"
STEP=preflight
HINT='Read the failed command and log, repair that prerequisite, then rerun this script.'
CHECK_ONLY=0
MODIFY_PATH=1
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --no-modify-path) MODIFY_PATH=0 ;;
    --help) printf 'Usage: bash scripts/install/macos.sh [--check] [--no-modify-path]\n--check checks tools without installing or downloading.\nCMRX_INSTALL_HOME selects the managed environment/log directory.\n'; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done
fail() { printf '\nERROR [%s]: %s\nRecovery: %s\nLog: %s\nRetry: /bin/bash %q\n' "$STEP" "$1" "$HINT" "${LOG:-not started}" "$ROOT/scripts/install/macos.sh" >&2; exit 1; }
on_error() {
  local status="$1" line="$2" command="$3"
  trap - ERR
  printf '\nINSTALLATION FAILED\nStep: %s\nExit code: %s\nLine: %s\nCommand: %s\nRecovery: %s\nLog: %s\nRetry: /bin/bash %q\nCompleted tools are checked and reused on retry. No automatic rollback was attempted.\n' "$STEP" "$status" "$line" "$command" "$HINT" "${LOG:-not started}" "$ROOT/scripts/install/macos.sh" >&2
  exit "$status"
}
trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
run() { printf '\n+ '; printf '%q ' "$@"; printf '\n'; "$@"; }
step() { STEP="$1"; HINT="$2"; printf '\n=== %s ===\n' "$STEP"; }
# Version checks execute the candidate, rather than trusting presence on PATH.
python_ok() { "$1" -c 'import sys,venv,ssl; assert (3,10) <= sys.version_info[:2] < (3,14)' >/dev/null 2>&1; }
node_ok() { "$1" -e 'if (+process.versions.node.split(".")[0] < 22) process.exit(1)' >/dev/null 2>&1; }
flutter_ok() {
  "$1" --version --machine 2>/dev/null | "$PYTHON" -c 'import json,sys; d=json.load(sys.stdin); v=tuple(map(int,d["dartSdkVersion"].split(" ")[0].split(".")[:2])); assert (3,12)<=v<(4,0)' >/dev/null 2>&1
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
brew_ready() {
  if [[ -n "${BREW:-}" ]]; then return; fi
  for candidate in "$(command -v brew || true)" /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [[ -x "$candidate" ]]; then BREW="$candidate"; break; fi
  done
  if [[ -z "${BREW:-}" ]]; then
    HINT='Homebrew needs administrator authorization on a fresh Mac. Run this same installer in an interactive Terminal if the agent cannot receive the password prompt. Check network access to raw.githubusercontent.com.'
    run /usr/bin/curl --fail --location --retry 3 https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o "$STATE/homebrew-install.sh"
    # Official installer scopes its own privileged operations. Never sudo brew.
    run /bin/bash "$STATE/homebrew-install.sh"
    for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
      if [[ -x "$candidate" ]]; then BREW="$candidate"; break; fi
    done
  fi
  [[ -n "${BREW:-}" ]] || fail 'Homebrew installer returned without a usable brew executable.'
  local prefix
  prefix="$("$BREW" --prefix)"
  export PATH="$prefix/bin:$prefix/sbin:$PATH"
  export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_UPGRADE=1
}
formula() {
  brew_ready
  if "$BREW" list --versions "$1" >/dev/null 2>&1; then
    # Existing formula can be older than our minimum; do not silently upgrade it.
    printf 'Already installed Homebrew formula: %s\n' "$1"
  else
    run "$BREW" install "$1"
  fi
  local prefix
  prefix="$("$BREW" --prefix "$1")"
  export PATH="$prefix/bin:$PATH"
}
main() {
  [[ "$(uname -s)" == Darwin ]] || fail 'This installer supports macOS only; no installation was attempted.'
  [[ "$EUID" -ne 0 ]] || fail 'Run as your normal user, not sudo bash. Individual installers request privilege when necessary.'
  [[ "$(uname -m)" == arm64 || "$(uname -m)" == x86_64 ]] || fail 'Unsupported CPU architecture.'
  if [[ "$(uname -m)" == x86_64 && "$(/usr/sbin/sysctl -in sysctl.proc_translated 2>/dev/null || true)" == 1 ]]; then
    fail 'Terminal is running through Rosetta. Open a native Apple Silicon terminal and rerun to avoid mixing architectures.'
  fi
  if [[ "$CHECK_ONLY" == 0 ]]; then
    mkdir -p "$STATE/logs" "$STATE/bin"
    LOG="$STATE/logs/install-$(date +%Y%m%d-%H%M%S)-$$.log"
    exec > >(tee -a "$LOG") 2>&1
    printf 'CMRX macOS installation\nToolkit: %s\nManaged files: %s\nLog: %s\n' "$ROOT" "$STATE" "$LOG"
  fi
  # Include normal Homebrew locations immediately; no terminal restart needed.
  export PATH="$STATE/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
  step python 'Install Python 3.10–3.13 with venv and SSL. Python 3.14 is not yet supported by the pinned ONNX packages. Existing interpreters are never overwritten.'
  PYTHON=''
  for candidate in "$(command -v python3 || true)" /opt/homebrew/bin/python3.13 /usr/local/bin/python3.13; do
    if [[ -x "$candidate" ]] && python_ok "$candidate"; then PYTHON="$candidate"; break; fi
  done
  if [[ -z "$PYTHON" && "$CHECK_ONLY" == 0 ]]; then formula python@3.13; PYTHON="$("$BREW" --prefix python@3.13)/bin/python3.13"; fi
  [[ -n "$PYTHON" ]] && python_ok "$PYTHON" || fail 'No compatible Python interpreter found.'
  printf 'Reuse Python: %s\n' "$PYTHON"; run "$PYTHON" --version
  step media 'Install/repair FFmpeg with ffprobe, libx264, AAC and prores_ks. If a Homebrew formula is already present but fails checks, inspect brew info ffmpeg and repair it explicitly.'
  if ! ffmpeg_ok; then [[ "$CHECK_ONLY" == 0 ]] || fail 'FFmpeg media requirements missing.'; formula ffmpeg; fi
  ffmpeg_ok || fail 'FFmpeg is present but required codecs or ffprobe are unavailable.'
  step node 'Node 22+ and npm are required. If an existing Homebrew node@22 is broken, repair that formula; older Node installations are preserved.'
  if ! command -v node >/dev/null || ! node_ok "$(command -v node)" || ! command -v npm >/dev/null; then
    [[ "$CHECK_ONLY" == 0 ]] || fail 'Node 22+ / npm missing.'; formula node@22
  fi
  node_ok "$(command -v node)" || fail 'Node version remains incompatible.'
  run node --version; run npm --version
  step flutter 'Install a Flutter SDK containing Dart >=3.12,<4. Existing incompatible Flutter SDKs are preserved; choose a compatible SDK on PATH, or repair the Homebrew flutter cask.'
  if ! command -v flutter >/dev/null || ! flutter_ok "$(command -v flutter)"; then
    [[ "$CHECK_ONLY" == 0 ]] || fail 'Compatible Flutter SDK missing.'
    brew_ready
    run "$BREW" install --cask flutter
  fi
  flutter_ok "$(command -v flutter)" || fail 'Flutter is installed but its Dart SDK is incompatible.'
  # Flutter's own Dart must precede unrelated Dart installations.
  export PATH="$(dirname "$(command -v flutter)"):$PATH"
  step transcription 'Install whisper-cpp with a working whisper-cli. Model download failures can be retried; existing user-selected models are retained.'
  if ! command -v whisper-cli >/dev/null || ! whisper-cli --help >/dev/null 2>&1; then
    [[ "$CHECK_ONLY" == 0 ]] || fail 'whisper-cli missing or unusable.'; formula whisper-cpp
  fi
  run whisper-cli --help
  step native-toolchain 'Install full Xcode from the App Store (Apple may require sign-in), open it to accept its license/install components, then rerun. If installed at /Applications/Xcode.app but not selected: sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer. Do not run the whole installer as root.'
  if ! xcrun --find clang >/dev/null 2>&1 || ! xcodebuild -version >/dev/null 2>&1; then fail 'Full Xcode is required for native editing/rendering; Command Line Tools alone are insufficient.'; fi
  if ! xcodebuild -license check >/dev/null 2>&1; then
    [[ "$CHECK_ONLY" == 0 ]] || fail 'Xcode license not accepted.'
    printf 'Xcode license requires human acceptance; showing Apple’s license command.\n'
    run sudo xcodebuild -license
  fi
  if ! command -v pod >/dev/null || ! pod --version >/dev/null 2>&1; then
    [[ "$CHECK_ONLY" == 0 ]] || fail 'CocoaPods missing.'; formula cocoapods
  fi
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
pathlib.Path(sys.argv[1]).write_text('# Generated by CMRX macOS installer\nexport PATH='+shlex.quote(':'.join(sys.argv[2:]))+'\n')
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
  for tool in python3 node npm flutter dart ffmpeg ffprobe whisper-cli pod fluvie; do
    printf '%s: %s\n' "$tool" "$(command -v "$tool")"
  done
  run python3 --version
  run flutter --version
  run ffmpeg -version
  run ffprobe -version
  run pod --version
  run git -C "$ROOT" rev-parse HEAD
  step verification 'Read the smoke-test traceback and preceding renderer output. Run flutter doctor -v for native-toolchain problems. Retry this installer after repairing the reported prerequisite. A failed render is not a successful installation.'
  run "$ROOT/.tools/video-tools-venv/bin/python" "$ROOT/scripts/install/verify.py" --state "$STATE"
  printf '\nINSTALLATION VERIFIED\nEnvironment: %s/env.sh\nLog: %s\nFor a new agent shell: source %q\nToolkit: %s\nMCP registration is host-specific; follow apps/review-agent/README.md.\n' "$STATE" "$LOG" "$STATE/env.sh" "$ROOT"
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main; fi
