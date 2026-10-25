"""Shared per-Flutter-project settings; no dependency mutation at launch."""
import json
import os
import re
from pathlib import Path

PIN = '10e442c1bb469118516df3335547f85ec92155e6'


def settings(project):
    root = Path(project).resolve()
    path = root / 'fluvie.json'
    data = json.loads(path.read_text()) if path.exists() else {}
    if not isinstance(data, dict):
        raise ValueError('fluvie.json must contain an object')
    result = dict(entry='build', draftEntry='buildDraft', path='lib/main.dart')
    result.update(data)
    for key in ('entry', 'draftEntry'):
        if not isinstance(result[key], str) or not re.fullmatch(r'[A-Za-z_$][A-Za-z0-9_$]*', result[key]):
            raise ValueError(f'Invalid Dart {key}')
    result['executable'] = data.get('executable') or os.environ.get('FLUVIE_BIN', 'fluvie')
    executable = result['executable']
    if not isinstance(executable, str) or not executable.strip():
        raise ValueError('Fluvie executable must be a nonempty path or command name')
    if not isinstance(result['path'], str):
        raise ValueError('Fluvie source path must be a string')
    if '/' in executable or '\\' in executable:
        result['executable'] = str((root / Path(executable).expanduser()).resolve())
    source = (root / result['path']).resolve()
    if not source.is_relative_to(root) or source.suffix != '.dart':
        raise ValueError('fluvie.json path must name a Dart file inside the Flutter project')
    result['path'] = str(source)
    return result
