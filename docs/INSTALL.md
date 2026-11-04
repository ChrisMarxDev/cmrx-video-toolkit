# Install the editing environment

From a toolkit checkout, run **one command as your normal user**:

```sh
bash install.sh
```

The installer detects macOS or Linux, reuses compatible tools and installs missing
requirements. Only privileged system operations use sudo. Package manager output
streams into a persistent log; failures show a step, recovery hint and retry
command. Unexpected failures include exit code, source line and failing command.
Rerun the same command after repairing the reported cause. No rollback or system
upgrade is performed. Models and healthy tools are reused; npm/Pub restoration
can run again.

## Platforms

- **macOS:** Homebrew installation path; full Xcode/license may need human action.
  See [macOS details](INSTALL-MACOS.md).
- **Linux:** glibc x86_64/aarch64 with apt-get (Debian/Ubuntu), dnf (Fedora), or
  pacman (Arch). Only missing system packages are installed. Fedora may require
  explicitly enabling a full-codec FFmpeg source yourself; the script reports
  missing codecs and never enables a third-party repository automatically.
- **Windows, musl/Alpine and other package managers:** not automated. The script
  reports unsupported platforms before installing anything. WSL is detected as
  Linux, but GPU/display/browser integration there has not been verified.

Linux installs base HTTPS/Git/archive tools, Clang/CMake/Ninja/pkg-config, GTK3
headers and C++ build tools as needed. Existing compatible Python 3.10–3.13,
Node22+/npm, Flutter with Dart3.12–3.x, FFmpeg/ffprobe and Whisper are reused.
Fallbacks stay user-owned: uv-managed Python3.13, a checksummed official Node22
archive, Flutter upstream stable checkout (resolved commit logged), and Whisper
v1.8.2 portable CPU build. System Python/Node/Flutter are preserved.

Shared installation restores media Python packages in the existing ignored
`.tools/video-tools-venv`, npm adapters and component Pub packages; prepares
verified default Whisper/RVM/speech-evidence models; and checks an actual synthetic
Fluvie render, video decode, audio encoding, transcription and saved review comment.
No provider credentials/accounts, paid generation, annex, phone tooling, or host
MCP registrations are installed. Project-specific dependencies/assets still belong
to their authored projects. Interactive playback/host integration require testing.

Linux managed files/logs default to `${XDG_DATA_HOME:-~/.local/share}/cmrx-video-toolkit`;
macOS uses `~/Library/Application Support/cmrx-video-toolkit`. Override with
`CMRX_INSTALL_HOME`. Log files can contain local paths; inspect before sharing.
The generated `env.sh` is sourced immediately and added idempotently to Bash/Zsh
startup files. Fish/other shells should launch Bash or use the managed tool paths.
Agents opening independent shells should source the printed env.sh explicitly.

```sh
bash install.sh --check           # Tool checks only; no packages/models/render
bash install.sh --no-modify-path  # Leave shell startup files unchanged
make install-test                # Regression checks; installs nothing
```

Existing Flutter commands may initialize their own SDK cache even in --check.
If the terminal cannot handle sudo/password/Apple prompts, the user runs this same
command in Terminal, then returns to their agent. An installer cannot grant local
command execution to a browser-only chat.

Validation: installer dispatch/package-reuse/error contracts are mock-tested.
The real shared render/transcription/comment test has passed on an existing Linux
workstation. Fresh Debian/Fedora/Arch and Apple Silicon/Intel Mac provisioning is
not yet validated. The installer fails instead of reporting success when its
verification does not pass.
