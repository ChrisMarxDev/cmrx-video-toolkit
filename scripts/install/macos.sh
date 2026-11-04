#!/bin/bash
# Platform wrapper; shared package/model/verification steps live in common.sh.
STATE="${CMRX_INSTALL_HOME:-$HOME/Library/Application Support/cmrx-video-toolkit}"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
EXTRA_TOOLS=pod
native_versions() { run pod --version; }
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
  finish_install
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main; fi
