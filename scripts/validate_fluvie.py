#!/usr/bin/env python3
"""Static Fluvie validation through the installed analyzer + lint CLI."""
import argparse
import json
import math
import os
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fluvie_project import settings


class ValidationUnavailable(ValueError):
    pass


def validate(path, *, project=None, fluvie_bin=None, strict=False, timeout=120):
    """Return a schema-1 report. Never execute authored Dart or change dependencies."""
    source = Path(path).expanduser().resolve()
    report = dict(schemaVersion=1, path=str(source), status='unavailable', ok=False,
                  strict=strict, diagnostics=[], counts=dict(error=0, warning=0, info=0))
    try:
        if source.suffix != '.dart' or not source.is_file():
            raise ValidationUnavailable('Expected an existing .dart composition file.')
        root = (Path(project).expanduser().resolve() if project else
                next((p for p in source.parents if (p / 'pubspec.yaml').is_file()), None))
        if root is None or not (root / 'pubspec.yaml').is_file():
            raise ValidationUnavailable('No project pubspec.yaml found; supply --project.')
        if not source.is_relative_to(root):
            raise ValidationUnavailable('Composition must be inside the selected project.')
        report['project'] = str(root)
        if not (root / '.dart_tool/package_config.json').is_file():
            raise ValidationUnavailable('Project dependencies are unresolved. Run flutter pub get in the project first.')
        if not math.isfinite(timeout) or timeout <= 0:
            raise ValidationUnavailable('Timeout must be a positive finite number of seconds.')
        # Paths are arguments, never shell interpolation. A path-like executable is
        # resolved before changing cwd; bare commands are resolved through PATH.
        fluvie_bin = fluvie_bin or settings(root)['executable']
        executable = str(Path(fluvie_bin).expanduser().resolve()) if '/' in fluvie_bin or '\\' in fluvie_bin else fluvie_bin
        result = subprocess.run(
            [executable, 'validate', str(source), '--project', str(root), '--json'],
            cwd=root, capture_output=True, text=True, timeout=timeout, check=False,
        )
        try:
            data = json.loads(result.stdout)
        except (ValueError, TypeError):
            raise ValidationUnavailable(
                'Fluvie did not return a validation report. Use a compatible CLI supporting '
                'validate <file> --project <dir> --json; select it with --fluvie-bin or FLUVIE_BIN. '
                + (result.stderr or result.stdout).strip()[:2000]) from None
        if not isinstance(data, dict) or data.get('schemaVersion') != 1:
            raise ValidationUnavailable('Unsupported Fluvie validation report schema.')
        if data.get('error'):
            raise ValidationUnavailable(str(data['error']))
        diagnostics = data.get('diagnostics')
        if not isinstance(data.get('ok'), bool) or not isinstance(diagnostics, list):
            raise ValidationUnavailable('Incomplete Fluvie validation report.')
        if data.get('path') != str(source):
            raise ValidationUnavailable('Fluvie returned a report for a different source path.')
        for d in diagnostics:
            if (not isinstance(d, dict) or d.get('severity') not in report['counts']
                    or not isinstance(d.get('message'), str)
                    or any(type(d.get(k)) is not int or d[k] < 1 for k in ('line', 'column'))):
                raise ValidationUnavailable('Malformed Fluvie diagnostic.')
        counts = {level: sum(d['severity'] == level for d in diagnostics) for level in report['counts']}
        if result.returncode != (1 if counts['error'] else 0) or data['ok'] != (counts['error'] == 0):
            raise ValidationUnavailable('Fluvie exit status and diagnostics disagree; validation is inconclusive.')
        ok = not counts['error'] and not (strict and counts['warning'])
        report.update(status='valid' if ok else 'invalid', ok=ok, diagnostics=diagnostics, counts=counts)
    except (OSError, subprocess.TimeoutExpired, ValueError) as error:
        report['error'] = str(error)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', help='Authored Dart file; relative imports stay in place')
    parser.add_argument('--project', help='Project directory (default: nearest pubspec.yaml)')
    parser.add_argument('--fluvie-bin', default=None, help='Compatible Fluvie executable path, not a shell command')
    parser.add_argument('--strict', action='store_true', help='Treat warnings as a failed check too')
    parser.add_argument('--json', action='store_true', help='Print one machine-readable report')
    parser.add_argument('--timeout', type=float, default=120, help='Analyzer timeout in seconds (default: 120)')
    args = parser.parse_args(argv)
    report = validate(args.path, project=args.project, fluvie_bin=args.fluvie_bin, strict=args.strict, timeout=args.timeout)
    if args.json:
        print(json.dumps(report, ensure_ascii=False))
    else:
        print(f"{report['status'].upper()}: {report['path']}")
        for d in report['diagnostics']:
            print(f"{report['path']}:{d['line']}:{d['column']}: {d['severity']}: {d['message']} [{d.get('code', 'analyzer')}]")
        if report.get('error'):
            print(report['error'])
        else:
            print(', '.join(f'{count} {level}' for level, count in report['counts'].items()))
    return 2 if report['status'] == 'unavailable' else (0 if report['ok'] else 1)


if __name__ == '__main__':
    sys.exit(main())
