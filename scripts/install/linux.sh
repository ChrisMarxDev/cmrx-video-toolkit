#!/bin/bash
# System packages alone use sudo; SDKs, source builds and caches stay user-owned.
STATE="${CMRX_INSTALL_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/cmrx-video-toolkit}"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
native_versions() { run clang --version; run cmake --version; }
select_manager() {
  if command -v apt-get >/dev/null; then MANAGER=apt;
  elif command -v dnf >/dev/null; then MANAGER=dnf;
  elif command -v pacman >/dev/null; then MANAGER=pacman;
  else fail 'Automatic Linux system packages support apt-get, dnf or pacman only. Install native dependencies manually, then rerun --check.'; fi
}
packages() {
  local missing=() package
  for package in "$@"; do
    case "$MANAGER" in
      apt) if ! dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -qx 'install ok installed'; then missing+=("$package"); fi ;;
      dnf) if ! rpm -q "$package" >/dev/null 2>&1; then missing+=("$package"); fi ;;
      pacman) if ! pacman -Q "$package" >/dev/null 2>&1; then missing+=("$package"); fi ;;
    esac
  done
  if [[ "${#missing[@]}" == 0 ]]; then return; fi
  [[ "$CHECK_ONLY" == 0 ]] || fail "Missing system packages: ${missing[*]}"
  if [[ "$HINT" != *'If sudo needs a password'* ]]; then
    HINT="$HINT If sudo needs a password but no terminal is available, ask the user to run this same installer in Terminal; never put passwords into command arguments."
  fi
  command -v sudo >/dev/null || fail "sudo is unavailable. Ask the system administrator to install: ${missing[*]}"
  case "$MANAGER" in
    apt)
      if [[ "${APT_UPDATED:-0}" == 0 ]]; then run sudo apt-get update; APT_UPDATED=1; fi
      run sudo apt-get install -y --no-install-recommends "${missing[@]}" ;;
    dnf) run sudo dnf install -y "${missing[@]}" ;;
    # Never use pacman -Sy: partial upgrades are unsupported on Arch.
    pacman) run sudo pacman -S --needed --noconfirm "${missing[@]}" ;;
  esac
}
base_packages() {
  case "$MANAGER" in
    apt) packages ca-certificates curl git tar xz-utils unzip ;;
    dnf) packages ca-certificates curl git tar xz unzip ;;
    pacman) packages ca-certificates curl git tar xz unzip ;;
  esac
}
native_packages() {
  case "$MANAGER" in
    apt) packages clang cmake ninja-build pkg-config libgtk-3-dev g++ make ;;
    dnf) packages clang cmake ninja-build pkgconf-pkg-config gtk3-devel gcc-c++ make ;;
    pacman) packages clang cmake ninja pkgconf gtk3 gcc make ;;
  esac
}
install_python() {
  local candidate
  PYTHON=''
  for candidate in "$(command -v python3 || true)" "$(command -v python3.13 || true)" "$(command -v python3.12 || true)" "$(command -v python3.11 || true)"; do
    if [[ -x "$candidate" ]] && python_ok "$candidate"; then PYTHON="$candidate"; return; fi
  done
  [[ "$CHECK_ONLY" == 0 ]] || fail 'No Python 3.10–3.13 with venv/SSL is available.'
  # Some distributions ship Python 3.14, unsupported by pinned ONNX wheels.
  # Use a user-owned compatible interpreter instead of replacing system Python.
  local uvbin
  uvbin="$(command -v uv || true)"
  if [[ -z "$uvbin" ]]; then
    run curl --fail --location --retry 3 https://astral.sh/uv/install.sh -o "$STATE/uv-install.sh"
    run env UV_INSTALL_DIR="$STATE/bin" UV_NO_MODIFY_PATH=1 sh "$STATE/uv-install.sh"
    uvbin="$STATE/bin/uv"
  fi
  export UV_PYTHON_INSTALL_DIR="$STATE/python" UV_PYTHON_BIN_DIR="$STATE/bin"
  run "$uvbin" python install 3.13
  PYTHON="$("$uvbin" python find --managed-python 3.13)"
  python_ok "$PYTHON" || fail 'Managed Python is incompatible or missing venv/SSL.'
}
install_node() {
  if command -v node >/dev/null && node_ok "$(command -v node)" && command -v npm >/dev/null; then return; fi
  [[ "$CHECK_ONLY" == 0 ]] || fail 'Node 22+ and npm missing.'
  local arch file checksum
  case "$(uname -m)" in x86_64) arch=x64;; aarch64|arm64) arch=arm64;; esac
  run curl --fail --location --retry 3 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$STATE/node-checksums.txt"
  file="$(awk -v arch="$arch" '$2 ~ ("-linux-" arch "[.]tar[.]xz$") {print $2}' "$STATE/node-checksums.txt")"
  [[ -n "$file" && "$file" != *$'\n'* && "$file" != */* ]] || fail 'Node checksum manifest did not identify exactly one architecture-matching archive.'
  checksum="$(awk -v file="$file" '$2 == file {print $1}' "$STATE/node-checksums.txt")"
  run curl --fail --location --retry 3 "https://nodejs.org/dist/latest-v22.x/$file" -o "$STATE/$file.part"
  run "$PYTHON" - "$STATE/$file.part" "$checksum" <<'PY'
import hashlib,pathlib,sys
assert hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest()==sys.argv[2], 'Node archive checksum mismatch; retry the download'
PY
  # Extract only into our new directory, never over an existing SDK.
  local unpack
  unpack="$(mktemp -d "$STATE/node-unpack.XXXXXX")"
  run tar -xJf "$STATE/$file.part" -C "$unpack" --strip-components=1
  if [[ -e "$STATE/node" ]]; then
    fail "Managed Node at $STATE/node is incompatible. Preserve/move it aside and rerun. Download retained at $STATE/$file.part."
  fi
  run mv "$unpack" "$STATE/node"
  export PATH="$STATE/node/bin:$PATH"
  node_ok "$(command -v node)" || fail 'Downloaded Node cannot run; check architecture and glibc compatibility.'
}
install_flutter() {
  if command -v flutter >/dev/null && flutter_ok "$(command -v flutter)"; then return; fi
  [[ "$CHECK_ONLY" == 0 ]] || fail 'Flutter with Dart >=3.12,<4 missing.'
  if [[ ! -d "$STATE/flutter" ]]; then
    run git clone --depth 1 --branch stable https://github.com/flutter/flutter.git "$STATE/flutter"
  fi
  [[ "$(git -C "$STATE/flutter" remote get-url origin)" == https://github.com/flutter/flutter.git ]] || fail 'Managed Flutter has an unexpected upstream; inspect before repair.'
  export PATH="$STATE/flutter/bin:$PATH"
  flutter_ok "$(command -v flutter)" || fail 'Managed Flutter is incompatible or failed SDK initialization. Inspect flutter --version; preserve the SDK before repair.'
  run git -C "$STATE/flutter" rev-parse HEAD
}
install_whisper() {
  if command -v whisper-cli >/dev/null && whisper-cli --help >/dev/null 2>&1; then return; fi
  [[ "$CHECK_ONLY" == 0 ]] || fail 'Working whisper-cli missing.'
  local source="$STATE/whisper-4979e04f5dcaccb36057e059bbaed8a2f5288315"
  if [[ ! -d "$source" ]]; then run git clone --depth 1 --branch v1.8.2 https://github.com/ggml-org/whisper.cpp.git "$source"; fi
  [[ "$(git -C "$source" rev-parse HEAD)" == 4979e04f5dcaccb36057e059bbaed8a2f5288315 ]] || fail 'Managed Whisper source does not match pinned v1.8.2 commit.'
  # Portable CPU build; do not require CUDA, a particular GPU, or runtime .so paths.
  run cmake -S "$source" -B "$source/build" -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DGGML_NATIVE=OFF
  run cmake --build "$source/build" --config Release --target whisper-cli --parallel 2
  run cp "$source/build/bin/whisper-cli" "$STATE/bin/whisper-cli"
  run whisper-cli --help
}
main() {
  [[ "$(uname -s)" == Linux ]] || fail 'This installer supports Linux only.'
  [[ "$EUID" -ne 0 ]] || fail 'Run as your normal user. Only system package installation uses sudo.'
  case "$(uname -m)" in x86_64|aarch64|arm64) ;; *) fail 'Supported Linux architectures: x86_64 and aarch64.';; esac
  if command -v ldd >/dev/null && ldd --version 2>&1 | grep -qi musl; then fail 'musl/Alpine is unsupported by the Flutter/Node/ONNX binary toolchain. Use a glibc distribution.'; fi
  local existing_flutter
  existing_flutter="$(command -v flutter || true)"
  if [[ "$CHECK_ONLY" == 0 ]]; then
    mkdir -p "$STATE/logs" "$STATE/bin"
    LOG="$STATE/logs/install-$(date +%Y%m%d-%H%M%S)-$$.log"
    exec > >(tee -a "$LOG") 2>&1
    printf 'CMRX Linux installation\nToolkit: %s\nManaged files: %s\nLog: %s\n' "$ROOT" "$STATE" "$LOG"
  fi
  export PATH="$STATE/bin:$STATE/node/bin:$STATE/flutter/bin:$PATH"
  step system-packages 'Read the package-manager error. Repair repository access/package names for your distribution; on Arch, complete a normal full system upgrade yourself if the package database is stale. No system-wide upgrade is run by this installer. If sudo needs a password but no terminal is available, ask the user to run this same installer in Terminal; never put passwords into command arguments.'
  select_manager; base_packages; native_packages
  step python 'Reuse/install Python 3.10–3.13 with venv/SSL. If none is compatible, uv downloads a user-owned Python 3.13 without changing system Python. Check HTTPS access to astral.sh/GitHub.'
  install_python; run "$PYTHON" --version
  step media 'FFmpeg requires ffprobe, libx264, AAC and prores_ks. Fedora may need a separately enabled full-codec repository: resolve that explicitly, then rerun. Existing incompatible FFmpeg installations are not replaced automatically.'
  if ! ffmpeg_ok; then packages ffmpeg; fi
  ffmpeg_ok || fail 'Installed FFmpeg does not provide the required encoders/ffprobe.'
  step node 'Check nodejs.org access, archive checksum, CPU architecture and glibc compatibility. Existing incompatible system Node is preserved.'
  install_node; run node --version; run npm --version
  step flutter 'Check GitHub/storage.googleapis.com access and Flutter SDK initialization output. Existing system Flutter is preserved; managed stable SDK stays under the installation directory.'
  if [[ -n "$existing_flutter" ]]; then export PATH="$(dirname "$existing_flutter"):$PATH"; fi
  install_flutter
  export PATH="$(dirname "$(command -v flutter)"):$PATH"
  step transcription 'Inspect the pinned Whisper CMake/compiler error; fix native dependencies and rerun. No GPU SDK is required for this CPU recognizer.'
  install_whisper
  finish_install
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main; fi
