#!/usr/bin/env python3
"""Install the tracked hook without replacing an existing custom hook setup."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
def git(*args):
    return subprocess.run(['git', '-C', str(root), *args], text=True,
                          capture_output=True, check=False)

configured = git('config', '--get', 'core.hooksPath').stdout.strip()
if configured and configured != '.githooks':
    raise SystemExit(f'Existing core.hooksPath={configured}; integrate .githooks/pre-push manually.')
if not configured:
    existing = Path(git('rev-parse', '--git-path', 'hooks/pre-push').stdout.strip())
    if not existing.is_absolute():
        existing = root / existing
    if existing.exists():
        raise SystemExit(f'Existing hook at {existing}; integrate the tracked pre-push hook manually.')
result = git('config', '--local', 'core.hooksPath', '.githooks')
if result.returncode:
    raise SystemExit(result.stderr)
print('Installed toolkit pre-push checks for this checkout.')
