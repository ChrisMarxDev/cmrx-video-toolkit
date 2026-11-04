# Guided macOS installation

Prefer `bash install.sh` from the toolkit root: it selects this platform
automatically. See [shared installation guide](INSTALL.md) for Linux.

Run from a toolkit checkout as your ordinary user, in one Terminal session:

```sh
bash scripts/install/macos.sh
```

An agent with local terminal access can run the same command. The script prints
commands before executing them, streams their output, and stops on the first
failure. It checks existing tools before installing missing requirements. It
never runs the whole installation as root, never uses `sudo brew`, and never
upgrades an existing Homebrew formula silently. Homebrew's official installer
requests system privileges when necessary; Xcode license acceptance is interactive.
A password/Apple account prompt can require a human if the agent's terminal
cannot handle it. No script can grant a chat application local terminal access.

## What happens

1. Check macOS/CPU and refuse root or Rosetta execution.
2. Reuse Python 3.10–3.13 with venv/SSL, FFmpeg/ffprobe with H.264/AAC/ProRes,
   Node 22+/npm, Flutter with Dart 3.12–3.x, and working whisper-cli when present.
3. Install missing tools using existing Homebrew, or install Homebrew with its
   official script first. Incompatible system tools remain untouched; Homebrew
   Python/Node can supply a compatible version in the installer environment.
4. Check full Xcode, license and CocoaPods. **Full Xcode cannot reliably be
   installed unattended**: if absent, follow the printed App Store/setup steps
   and rerun. A fully provisioned Mac continues in the same session.
5. Reuse a Fluvie CLI exposing the required render/validate flags, or create a
   managed checkout at upstream revision `10e442c1bb469118516df3335547f85ec92155e6`.
   This path installs rendered-video editing, not the old scene-preview patches.
6. Restore locked review/catalog/generation-adapter npm packages, component Pub
   dependencies, an isolated Python media environment, and verified RVM/Whisper/
   speech-evidence models. Existing discovered Whisper models are reused as-is;
   verification applies to the downloaded default, not arbitrary user models.
7. Write an environment file and add an idempotent source line to Bash/Zsh startup
   files. It is also sourced immediately: no terminal restart during installation.
8. Render a one-second synthetic Fluvie composition, fully decode it, encode AAC,
   transcribe the synthetic audio, prepare a review and round-trip a saved comment.

Optional generation still requires the user's own service connection/credentials;
no accounts, paid API calls, agent-specific MCP registrations, annex, phone tools,
Android SDK, or iOS signing are installed. Project-specific Pub dependencies and
3D assets are resolved when authoring those projects. Native feature support and
interactive playback still require acceptance on the actual machine.

## Failures and agent recovery

Default managed location: `~/Library/Application Support/cmrx-video-toolkit`.
`CMRX_INSTALL_HOME` overrides it. Each run writes a timestamped log under `logs/`.
The reusable media venv and RVM model use the toolkit’s existing ignored `.tools/`
locations, so existing effect commands keep working.
Failures identify the stage, recovery hint and retry command. Unexpected command
failures additionally include exit status, source line and shell command. Output
from failing package managers/renderers stays in the log. Logs can contain local
paths and package-manager output; inspect before sharing externally.

For an agent: read the **first failing step and its underlying output**, inspect
installed versions/paths, repair only that prerequisite, then rerun the same
command. Do not delete user SDKs, edit project lockfiles, run the script as root,
or report success before `INSTALLATION VERIFIED`. Completed tools/models are
rechecked and reused. npm/Pub restoration may run again; this is not a transactional
installer and does not roll back successful system package installations.

Useful options:

```sh
# Tool/version checks only; no package/model installation or smoke render.
# Invoking an existing Flutter SDK may initialize its own cache.
bash scripts/install/macos.sh --check

# Keep startup files unchanged. Source the printed env.sh in agent commands.
bash scripts/install/macos.sh --no-modify-path
```

For a fresh agent shell, use the printed absolute path:

```sh
source "$HOME/Library/Application Support/cmrx-video-toolkit/env.sh"
python3 /absolute/toolkit/scripts/video.py --help
```

Agent handoff prompt:

> Use the toolkit at PATH. Run its scripts/install/macos.sh installer as my normal
> user. Reuse compatible tools; repair failures using its complete log and recovery
> hints. Ask me to handle password, Xcode license or Apple account prompts when
> necessary. Continue after those steps and rerun until verification passes. Then
> follow .skills/edit-video/SKILL.md for my footage. Keep my source recordings and
> video projects outside the toolkit checkout. Configure review integration for
> my agent host, using browser review if inline review is unavailable.

Implementation status: eight shell/diagnostic regression checks, the toolkit’s
90 Python tests (two optional skips), and the actual synthetic render/transcription/
comment acceptance passed on Linux. Fresh Apple Silicon/Intel Mac installation
and actual macOS rendering remain
unverified; this is an initial installer, not a clean-machine compatibility claim.

Official prerequisites: [Homebrew](https://docs.brew.sh/Installation),
[Flutter macOS setup](https://docs.flutter.dev/platform-integration/macos/setup).
