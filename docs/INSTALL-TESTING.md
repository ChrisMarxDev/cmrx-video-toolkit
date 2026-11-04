# Installer acceptance — 2026-11-04

## Environment and isolation

The actual installer was run as a normal user with sudo inside a fresh Ubuntu
24.04.3 amd64 userland, isolated using Linux user/mount/PID namespaces. Only the
sandbox filesystem was writable; no host home directory, FVM installation,
project settings, or SDK cache was mounted inside it. This tests real package
installation/downloads, not mocked package-manager commands. It is not a complete
VM, physical desktop or GPU acceptance test.

The official [Ubuntu Base archive](https://cdimage.ubuntu.com/ubuntu-base/releases/24.04/release/ubuntu-base-24.04.3-base-amd64.tar.gz)
was verified against its published SHA-256:
`6bc2cde3930ad088b3bb46fa45279e96d25bc3810f209850ecbe4722711874f9`.
The fixture supplied only sudo access and CA certificates before the installer;
base/native packages, runtimes, SDKs, recognizer and models came through the
installer. The toolkit directory deliberately contained spaces. Public source
revision `397d8a3` plus the fixes in this change was exercised.

Observed fallback versions: Python 3.13.18, Node 22.23.4, Flutter 3.47.9 / Dart
3.13.7, Whisper v1.8.2, system FFmpeg 6.1.1. Package-manager releases are not a new
version pin; committed requirements and the Fluvie revision remain authoritative.

## Results

- Fresh provisioning reached `INSTALLATION VERIFIED` after recovering from the
  initial cold Flutter version-check failure. Version parsing now tolerates setup
  text before machine JSON and retains startup errors in the log.
- The installed tools rendered a one-second Fluvie composition, decoded the whole
  video, encoded AAC, ran Whisper and prepared a canonical review document.
- A real loopback review server served HTML/JS/CSS and a partial video request;
  an authenticated HTTP comment save persisted and advanced the revision.
- A second full run reused the installed system packages and runtimes, with no
  sudo package operations or SDK clones. npm/Pub restoration still runs by design.
- A selected FVM-style SDK path remained selected, its default symlink and project
  `.fvmrc` remained unchanged, and a fresh login shell found Python/Flutter/Fluvie.
  This is an SDK-path preservation test, not a test of installing the FVM CLI.
- Missing sudo/password input failed safely with the actual failed command,
  persistent log, retry command and an explicit user-terminal recovery hint.
- Corrupting the cached RVM model caused checksum rejection. Restoring the fixture
  and rerunning reached verification again; shell-profile hashes stayed unchanged
  with exactly one environment-source line per file. The checksum error names the
  offending path and tells the agent to preserve/move it aside before retrying.
- Host shell-profile hashes, FVM configuration and default SDK target were checked
  against their pre-test baseline. No host Flutter or FVM command was executed.

All 99 toolkit Python tests completed with two optional skips; the 17 installer
regression checks pass. They also cover unsupported platforms, argument/exit-code
forwarding, package reuse, check-only behavior and Arch partial-upgrade avoidance:

```sh
make install-test
python3 -m unittest discover -s tests -q
```

## Remaining acceptance

Fresh macOS (Apple Silicon/Intel), Fedora, Arch, Debian, aarch64, WSL, physical
GPU/native 3D effects, real browser interaction and host MCP registration remain
unverified. The synthetic tone tests recognizer operation, not transcription
accuracy or editorial quality. Do not infer those guarantees from this acceptance.

To repeat fresh provisioning, use a disposable supported machine or namespace
filesystem with its own normal user, sudo and home directory. Run `bash install.sh`,
then rerun it and `bash install.sh --check`. Keep the complete logs. Never test
fresh installation by removing or replacing a developer's real SDKs or profiles.
