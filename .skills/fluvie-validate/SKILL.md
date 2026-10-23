---
name: fluvie-validate
description: Check authored Fluvie Dart files for analyzer errors and Fluvie lint warnings before preview or export, or diagnose static composition failures. Does not render or perform visual review.
---

# Validate Fluvie compositions

Use the shared validator in the toolkit checkout. Installed skills contain guidance,
not the runtime; locate the checkout through edit-video's tooling readiness when
needed. Commands below are toolkit-root-relative.

```sh
python3 scripts/validate_fluvie.py /absolute/project/lib/video.dart --json
```

The tool calls a compatible `fluvie validate` CLI, which runs `fluvie_validate`
and its default `fluvie_lints` rules together. It preserves the original file and
relative imports. Use `--project /absolute/project` for explicit resolution;
otherwise it finds the nearest pubspec. Use `--fluvie-bin /path/to/fluvie` or
`FLUVIE_BIN` for a compatible existing installation. See
`tools/validator/README.md` in the toolkit checkout for setup and report details.

- Exit 0: no errors; inspect and explain any warnings. `--strict` also fails on warnings.
- Exit 1: source findings failed the chosen policy. Fix errors in scope, evaluate
  warnings, then rerun the same file. Preserve authored intent; do not silence
  diagnostics merely to obtain a pass.
- Exit 2: validation could not complete. Resolve missing dependencies, unsupported
  CLI or timeout; never describe this as a successful check. Preserve project pins.

Run after composition changes and before opening a preview or starting an export.
Reuse a completed check while the relevant source/dependencies remain unchanged.
The tool checks one file, not every imported file: validate changed custom-widget
files too, and use project analysis when broader dependency diagnostics matter.

Report errors/warnings with file, line, column and rule code. Return control to
fluvie-compose or fluvie-render after the check. Static success does not establish
asset existence, capture-platform support, visual quality, audio sync, or safety
of executing arbitrary code. It does not authorize rendering or publication.
