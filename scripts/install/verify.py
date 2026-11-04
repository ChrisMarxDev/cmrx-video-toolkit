#!/usr/bin/env python3
"""Acceptance checks for the installed editing environment; never uses user media."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def run(*args, cwd=None, capture=False):
    print('+', ' '.join(map(str, args)), flush=True)
    result = subprocess.run(list(map(str, args)), cwd=cwd, check=True,
                            text=True, stdout=subprocess.PIPE if capture else None)
    return result.stdout if capture else None


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--state', type=Path, required=True)
    a = p.parse_args()
    root = Path(__file__).resolve().parents[2]
    # A new scratch directory preserves failed evidence and cannot replace a project.
    scratch = Path(tempfile.mkdtemp(prefix='verify-', dir=a.state))
    print('Verification artifacts:', scratch, flush=True)
    run('flutter', 'create', '--platforms=macos', '--project-name=cmrx_install_check', scratch / 'composition')
    project = scratch / 'composition'
    # Published 0.3.1 predates the pinned CLI render-host API despite the same
    # version label. Pin both library and companion media package explicitly.
    def upstream(package):
        return {'git': {'url': 'https://github.com/SimonErich/fluvie.git',
                        'ref': '10e442c1bb469118516df3335547f85ec92155e6',
                        'path': 'packages/' + package}}
    (project / 'pubspec.yaml').write_text(json.dumps({
        'name': 'cmrx_install_check', 'publish_to': 'none',
        'environment': {'sdk': '>=3.12.0 <4.0.0'},
        'dependencies': {'flutter': {'sdk': 'flutter'}, 'fluvie': upstream('fluvie')},
        'dependency_overrides': {'fluvie_media': upstream('fluvie_media')},
        'dev_dependencies': {'flutter_test': {'sdk': 'flutter'}},
        'flutter': {'uses-material-design': True},
    }, indent=2))
    (project / 'lib/main.dart').write_text('''import 'package:flutter/widgets.dart';
import 'package:fluvie/fluvie.dart';
Video build() => Video(size: const VideoSize(320, 180), fps: 24, scenes: [
  Scene(duration: 1.seconds, children: [const ColoredBox(color: Color(0xFF6845A1))]),
]);
void main() {}
''')
    run('flutter', 'pub', 'get', cwd=project)
    run('fluvie', 'render', project / 'lib/main.dart', '--project', project,
        '--entry', 'build', '--out', scratch / 'render.mp4', '--toolchain', 'system',
        '--no-download', '--quality', 'medium', '--machine', cwd=project)
    run('ffmpeg', '-v', 'error', '-i', scratch / 'render.mp4', '-f', 'null', '-')
    probe = json.loads(run('ffprobe', '-v', 'error', '-show_streams', '-show_format',
                           '-of', 'json', scratch / 'render.mp4', capture=True))
    assert any(s['codec_type'] == 'video' for s in probe['streams']), 'No video stream'
    assert 0.8 <= float(probe['format']['duration']) <= 1.2, 'Unexpected render duration'
    # Exercise audio encoding separately; the synthetic composition has no soundtrack.
    run('ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
        '-c:a', 'aac', scratch / 'audio.m4a')
    # Import the exact installed review backend and create/load its canonical document.
    sys.path.insert(0, str(root / 'apps/editor'))
    import review
    run('ffmpeg', '-v', 'error', '-i', scratch / 'render.mp4', '-i', scratch / 'audio.m4a',
        '-c', 'copy', '-shortest', scratch / 'review-input.mp4')
    doc = review.prepare(scratch / 'review-input.mp4', scratch / 'review', progress=print)
    assert doc['transcript']['status'] == 'ready', 'Transcription did not finish'
    doc['marks'].append(dict(id='install-test', kind='comment', text='Installation test',
                             source_start=0, source_end=0.5))
    review.write(scratch / 'review/review.json', review.validate(doc))
    assert review.read(scratch / 'review/review.json')['marks'][0]['text'] == 'Installation test'
    import numpy, onnxruntime
    print('Media environment:', numpy.__version__, onnxruntime.__version__)
    # Verify Node can load the installed adapter dependency without starting a server.
    run('node', '--input-type=module', '-e', "await import('@modelcontextprotocol/sdk/server/mcp.js')",
        cwd=root / 'apps/review-agent')
    print('PASS: Flutter/Fluvie render, full decode, AAC encoding, Whisper transcription and saved review comment. '
          'Interactive playback, shortcuts and host MCP registration still require human/host testing.')


if __name__ == '__main__':
    main()
