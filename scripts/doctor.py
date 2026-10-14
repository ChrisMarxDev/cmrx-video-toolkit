#!/usr/bin/env python3
"""Report local workflow prerequisites without installing or downloading anything."""
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
print(json.dumps({
    'commands': {name: shutil.which(name) for name in ['python3', 'ffmpeg', 'ffprobe', 'whisper-cli', 'git', 'flutter', 'dart', 'fluvie']},
    'skills': len(list((root / '.skills').glob('*/SKILL.md'))),
}, indent=2))
