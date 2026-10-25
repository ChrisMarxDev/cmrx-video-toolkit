# Fluvie validator

A small, read-only adapter around `fluvie validate`: Dart analyzer diagnostics plus
Fluvie's lint rules, without rendering or executing the composition. The shared
entrypoint is `scripts/validate_fluvie.py`; the agent workflow is
[fluvie-validate](../../.skills/fluvie-validate/SKILL.md).

```sh
python3 scripts/validate_fluvie.py /absolute/project/lib/video.dart
python3 scripts/validate_fluvie.py /absolute/project/lib/video.dart --json --strict
```

## Requirements

Python 3.10+, Flutter/Dart, resolved project dependencies, and a Fluvie CLI with
`validate <file> --project <dir> --json`. The CLI includes `fluvie_validate`, which
runs the default `fluvie_lints` rules; no separate custom-lint invocation or new
project dependency is needed for this check. Resolve the project's existing pins
with `flutter pub get` first. The validator never installs or upgrades anything.

Tested against upstream revision
[`10e442c1bb469118516df3335547f85ec92155e6`](https://github.com/SimonErich/fluvie/tree/10e442c1bb469118516df3335547f85ec92155e6).
Some original published 0.3.1 CLIs lack this command. Check local help rather than
assuming the version number establishes support. Reuse a compatible source
checkout if one already powers the Previewer; its preview patches are not needed
for static validation. To select that checkout, use an executable launcher:

```sh
#!/bin/sh
exec dart /absolute/fluvie/packages/fluvie_cli/bin/fluvie.dart "$@"
```

Make the launcher executable and pass its path with `--fluvie-bin`, or set
`FLUVIE_BIN`. Without an explicit --fluvie-bin, the project fluvie.json executable
takes precedence over the environment, matching preview/export. This is an executable path, not a command string. The upstream
checkout must have its own dependencies resolved. No FFmpeg, browser, model or
provider key is needed by the validation operation.

## Reports and policy

Human-readable output is the default; `--json` prints one schema-1 object with
`path`, `project` (when found), `status`, `ok`, `strict`, `counts`, `diagnostics`
and optional `error`. Diagnostics retain upstream severity, message, rule code,
1-based line/column and optional length.

- Exit **0**, `valid`: no errors. Warnings remain visible.
- Exit **1**, `invalid`: errors, or warnings when `--strict` is selected.
- Exit **2**, `unavailable`: missing setup/input, timeout, unsupported/malformed
  upstream output, or inconsistent exit status. This is not a passing check.

`--timeout` bounds the CLI process (120 seconds by default). `--project` selects
the project explicitly; otherwise the nearest parent pubspec is used. The file
must be within that project. Paths are passed as arguments without a shell.

Validation resolves imports but reports findings for the requested file only.
Check changed supporting Dart files separately or run project analysis as well.
Static success does not verify media files, pixels, audio sync, render platform
support, or sandbox arbitrary code. Existing project suppressions are honored by
upstream; do not add blanket ignores to make a report green.

## Checks

```sh
python3 -m unittest discover -s tests -p 'test_validate_fluvie.py' -v
```

For a real integration check, validate a compilable composition, one containing an
undefined identifier, and one reading `DateTime.now()` inside its authored video.
The last must emit the `nondeterministic_video` warning and fail only in strict
mode. Keep synthetic fixtures outside production projects and never render them.
