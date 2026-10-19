#!/usr/bin/env python3
"""Local workflow CLI. Python standard library; FFmpeg and Flutter are external tools."""
import argparse
import os
import hashlib
import json
import math
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    temporary.replace(path)


def run(args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def filter_graph_args(path):
    # FFmpeg 9 removed the legacy flag; older FFmpeg lacks slash-prefixed file options.
    # Detect the advertised flag rather than imposing a platform-specific version pin.
    help_text = run(['ffmpeg', '-hide_banner', '-h', 'full'], capture_output=True,
                    text=True, errors='replace').stdout
    flag = '-filter_complex_script' if '-filter_complex_script' in help_text else '-/filter_complex'
    return [flag, str(path)]


def probe(path):
    return json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_streams',
                           '-of', 'json', path], capture_output=True, text=True).stdout)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def finite(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def interval(start, end, duration):
    if not finite(start) or not finite(end) or not 0 <= start < end <= duration + 1e-6:
        raise ValueError(f'Invalid source interval {start}..{end} for duration {duration}')


def import_cut(data, duration):
    """Build retained word runs, trimming leading/trailing silence."""
    if data.get('version') == 2:
        if not finite(duration) or duration <= 0:
            raise ValueError('Expected a positive source duration')
        if 'words' in data or 'deletedRanges' in data:
            raise ValueError('Range edits cannot contain word decisions')
        ranges = data.get('retainedRanges')
        if not isinstance(ranges, list) or not ranges:
            raise ValueError('Range edits need nonempty retainedRanges')
        spans, cursor, previous_end = [], 0.0, 0.0
        for item in ranges:
            start, end = item['source_start'], item['source_end']
            interval(start, end, duration)
            if start < previous_end:
                raise ValueError('Retained ranges must be ordered and nonoverlapping')
            spans.append(dict(source_start=start, source_end=end,
                              output_start=cursor, output_end=cursor+end-start))
            cursor += end-start
            previous_end = end
        result = dict(version=1, source_duration=duration, duration=cursor,
                      spans=spans, words=[], granularity='audio-ranges',
                      edit_digest=digest(data))
        result['revision'] = digest(result)
        return result
    if data.get('version') != 1 or not finite(duration) or duration <= 0:
        raise ValueError('Expected edit version 1 and a positive source duration')
    words = data['words']
    previous_end = 0
    for w in words:
        interval(w['start'], w['end'], duration)
        if w['start'] < previous_end - 1e-6:
            raise ValueError('Overlapping/out-of-order words need boundary correction before import')
        previous_end = w['end']
    deleted = set()
    for r in data.get('deletedRanges', []):
        for i in r['wordIndices']:
            if type(i) is not int or not 0 <= i < len(words):
                raise ValueError(f'Invalid deleted word index: {i}')
            deleted.add(i)
    ranges = []
    first = None
    for i, w in enumerate(words):
        if i not in deleted and first is None:
            first = i
        if i in deleted and first is not None:
            ranges.append((words[first]['start'], words[i - 1]['end']))
            first = None
    if first is not None:
        ranges.append((words[first]['start'], words[-1]['end']))
    if not words:
        ranges = [(0, duration)]
    if not ranges:
        raise ValueError('The edit removes every word; nothing to render')
    spans, cursor = [], 0.0
    for start, end in ranges:
        spans.append(dict(source_start=start, source_end=end, output_start=cursor,
                          output_end=cursor + end - start))
        cursor += end - start
    retained = []
    for i, w in enumerate(words):
        if i in deleted:
            continue
        span = next(s for s in spans if s['source_start'] <= w['start'] and w['end'] <= s['source_end'])
        retained.append(dict(id=f'w{i:06d}', text=w['word'], source_start=w['start'],
                             source_end=w['end'], start=span['output_start'] + w['start'] - span['source_start'],
                             end=span['output_start'] + w['end'] - span['source_start']))
    result = dict(version=1, source_duration=duration, duration=cursor, spans=spans, words=retained,
                  edit_digest=digest(data))
    result['revision'] = digest(result)
    return result


def map_annotations(annotations, timeline):
    if annotations.get('version') != 1:
        raise ValueError('Expected annotations version 1')
    mapped = []
    seen = set()
    for note in annotations['notes']:
        if not isinstance(note.get('id'), str) or not note['id'] or note['id'] in seen:
            raise ValueError('Annotation ids must be nonempty and unique')
        seen.add(note['id'])
        interval(note['source_start'], note['source_end'], timeline['source_duration'])
        windows = []
        for s in timeline['spans']:
            a, b = max(note['source_start'], s['source_start']), min(note['source_end'], s['source_end'])
            if a < b:
                windows.append(dict(start=s['output_start'] + a - s['source_start'],
                                    end=s['output_start'] + b - s['source_start']))
        mapped.append({**note, 'windows': windows, 'status': 'mapped' if windows else 'removed-by-edit'})
    return dict(version=1, timeline_revision=timeline['revision'], notes=mapped)


def project_dir(value):
    p = Path(value).resolve()
    if not (p / 'project.json').exists():
        raise ValueError(f'Not a video project: {p}')
    return p


def init(args):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', args.name):
        raise ValueError('Project name must use lowercase letters, numbers, and hyphens')
    source = Path(args.source).resolve()
    if not source.is_file():
        raise ValueError(f'Missing recording: {source}')
    p = Path(os.environ.get('CMRX_WORKSPACE', str(ROOT))) / os.environ.get('CMRX_VIDEO_DIR', 'projects') / args.name
    p.mkdir(parents=True, exist_ok=False)
    for folder in ['source', 'transcript', 'edit', 'storyboard', 'composition/lib', 'composition/assets', 'renders', 'review']:
        (p / folder).mkdir(parents=True, exist_ok=True)
    write(p / 'project.json', dict(version=1, name=args.name, source=str(source), fps=30, width=1920, height=1080))
    (p / 'brief.md').write_text('# Video brief\n\nAudience:\nPurpose:\nKeep these passages:\nRemove:\nAnimation requests:\nPresenter visibility:\nTerminology and factual references:\n')
    write(p / 'annotations.json', dict(version=1, notes=[]))
    print(p)


def inspect(args):
    p = project_dir(args.project)
    source = read(p / 'project.json')['source']
    info = probe(source)
    write(p / 'source/media.json', info)
    run(['ffmpeg', '-v', 'error', '-y', '-i', source, '-vn', '-ac', '1', '-ar', '16000', p / 'source/transcription.wav'])
    print('Extracted transcription audio; original recording unchanged.')


def import_edit(args):
    p = project_dir(args.project)
    data = read(args.file)
    source = Path(read(p / 'project.json')['source']).resolve()
    imported_source = Path(data['videoPath']).expanduser().resolve()
    if imported_source != source:
        raise ValueError(f'Edit source {imported_source} differs from project source {source}')
    duration = float(probe(source)['format']['duration'])
    timeline = import_cut(data, duration)
    write(p / 'edit/decisions.json', data)
    write(p / 'edit/timeline.json', timeline)
    write(p / 'storyboard/annotations.resolved.json', map_annotations(read(p / 'annotations.json'), timeline))
    print(f"Imported {len(timeline['spans'])} spans; {timeline['duration']:.3f}s. Rebuild cut and composition after changes.")


def annotate(args):
    p = project_dir(args.project)
    notes = read(p / 'annotations.json')
    duration = float(probe(read(p / 'project.json')['source'])['format']['duration'])
    interval(args.start, args.end, duration)
    if any(n['id'] == args.id for n in notes['notes']):
        raise ValueError('Annotation id already exists; edit the existing note in annotations.json')
    notes['notes'].append(dict(id=args.id, source_start=args.start, source_end=args.end,
                              intent=args.text, component=args.component, presentation=args.presentation))
    write(p / 'annotations.json', notes)
    if (p / 'edit/timeline.json').exists():
        write(p / 'storyboard/annotations.resolved.json', map_annotations(notes, read(p / 'edit/timeline.json')))


def cut(args):
    p = project_dir(args.project)
    config, timeline = read(p / 'project.json'), read(p / 'edit/timeline.json')
    filters, streams = [], []
    for i, s in enumerate(timeline['spans']):
        a, b = s['source_start'], s['source_end']
        filters += [f'[0:v:0]trim=start={a}:end={b},setpts=PTS-STARTPTS,fps={config["fps"]}[v{i}]',
                    f'[0:a:0]atrim=start={a}:end={b},asetpts=PTS-STARTPTS[a{i}]']
        streams.append(f'[v{i}][a{i}]')
    filters.append(''.join(streams) + f'concat=n={len(streams)}:v=1:a=1[v][a]')
    graph = p / 'edit/filtergraph.txt'
    graph.write_text(';\n'.join(filters))
    target = p / 'composition/assets/rough-cut.mp4'
    temporary = target.with_name('rough-cut.pending.mp4')
    run(['ffmpeg', '-v', 'error', '-y', '-i', config['source'], *filter_graph_args(graph),
         '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
         '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-movflags', '+faststart', temporary])
    temporary.replace(target)
    run(['ffmpeg', '-v', 'error', '-y', '-i', target, '-vn', '-c:a', 'pcm_s16le', p / 'edit/narration.wav'])
    write(p / 'edit/cut-manifest.json', dict(timeline_revision=timeline['revision'], output=str(target)))
    print(target)


def dart_string(value):
    # JSON strings are valid Dart strings after escaping interpolation and Unicode line separators.
    return json.dumps(value, ensure_ascii=True).replace('$', r'\$')


def compose(args):
    p = project_dir(args.project)
    config = read(p / 'project.json')
    timeline = read(p / 'edit/timeline.json')
    if read(p / 'edit/cut-manifest.json')['timeline_revision'] != timeline['revision']:
        raise ValueError('Rough cut is stale; run cut first')
    composition = p / 'composition'
    main = composition / 'lib/main.dart'
    if main.exists() and not args.replace:
        raise ValueError('Composition exists. Edit it directly, or explicitly pass --replace to regenerate.')
    package = Path(os.environ.get('CMRX_COMPONENT_PACKAGE', str(ROOT / 'components')))
    package_name = os.environ.get('CMRX_COMPONENT_NAME', 'video_components')
    token_class = os.environ.get('CMRX_TOKEN_CLASS')
    background = f'{token_class}.ink' if token_class else 'const Color(0xFF000000)'
    (composition / 'pubspec.yaml').write_text(f'''name: video_composition
publish_to: none
environment:
  sdk: '>=3.12.0 <4.0.0'
dependencies:
  flutter:
    sdk: flutter
  fluvie: 0.3.1
  {package_name}:
    path: {package}
dev_dependencies:
  flutter_test:
    sdk: flutter
  alchemist: ^0.14.0
flutter:
  uses-material-design: true
  assets:
    - assets/
''')
    main.write_text(f'''import 'package:flutter/widgets.dart' hide Animation, Clip, Image, Tween;
import 'package:fluvie/fluvie.dart';
import 'package:{package_name}/{package_name}.dart';

// Baseline composition. Add narration-synchronized overlays from storyboard/.
// Keep this Clip mounted throughout so original narration continues under graphics.
Video buildDraft() => draftVideo(build());

Video build() => Video(
  size: const VideoSize({config.get('width', 1920)}, {config.get('height', 1080)}),
  fps: {config['fps']},
  scenes: [Scene(
    duration: {timeline['duration']}.seconds,
    background: Background.color({background}),
    children: [
      Clip.asset('assets/rough-cut.mp4', fit: BoxFit.contain),
    ],
  )],
);
''')
    write(composition / 'manifest.json', dict(timeline_revision=timeline['revision'],
                                             note='Baseline footage; agent authors animations from storyboard.'))
    print(main)


def fluvie(args):
    p = project_dir(args.project)
    timeline = read(p / 'edit/timeline.json')
    for file in ['edit/cut-manifest.json', 'composition/manifest.json']:
        if read(p / file)['timeline_revision'] != timeline['revision']:
            raise ValueError(f'{file} is stale. Reconcile narration and animation before proceeding.')
    if args.command == 'render' and args.final and not args.approved:
        raise ValueError('Final export needs --approved after the user approves the preview. Use draft otherwise.')
    command = ['fluvie', 'preview' if args.command == 'preview' else 'render', 'lib/main.dart']
    if args.command == 'render':
        config = read(p / 'project.json')
        scale = 1 if args.final else .5
        estimate = config.get('width', 1920) * config.get('height', 1080) * scale ** 2 * 4 * config['fps'] * timeline['duration']
        available = shutil.disk_usage(tempfile.gettempdir()).free
        if estimate * 1.25 > available:
            raise ValueError(f'Raw capture needs about {estimate / 1e9:.1f} GB plus headroom; only {available / 1e9:.1f} GB free in the temp directory. Set TMPDIR to a larger disk or shorten the render.')
        target = p / 'renders' / ('final.mp4' if args.final else 'draft.mp4')
        command += ['--out', str(target), '--quality', 'high' if args.final else 'low']
        if not args.final:
            command += ['--entry', 'buildDraft']
    run(command, cwd=p / 'composition')


def qa(args):
    p = project_dir(args.project)
    target = Path(args.file).resolve()
    info, timeline = probe(target), read(p / 'edit/timeline.json')
    kinds = {s['codec_type'] for s in info['streams']}
    delta = abs(float(info['format']['duration']) - timeline['duration'])
    result = dict(file=str(target), duration_delta=delta, has_video='video' in kinds,
                  has_audio='audio' in kinds, passed=delta < .15 and {'video', 'audio'} <= kinds)
    write(p / 'review/media-check.json', result)
    for i, fraction in enumerate([.1, .5, .9]):
        run(['ffmpeg', '-v', 'error', '-y', '-ss', str(timeline['duration'] * fraction), '-i', target,
             '-frames:v', '1', p / f'review/frame-{i}.png'])
    print(json.dumps(result, indent=2))
    if not result['passed']:
        raise ValueError('Media checks failed; inspect review/media-check.json')


def soundmap(args):
    command = ['python3', ROOT / 'scripts/soundmap.py', args.project,
               '--threshold-db', str(args.threshold_db), '--min-pause', str(args.min_pause),
               '--padding', str(args.padding)]
    if args.transcript:
        command += ['--transcript', args.transcript]
    if args.transcript_time_base:
        command += ['--transcript-time-base', args.transcript_time_base]
    run(command)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('init'); p.add_argument('name'); p.add_argument('--source', required=True); p.set_defaults(func=init)
    for name, fn in [('soundmap', soundmap), ('inspect', inspect), ('cut', cut), ('compose', compose), ('preview', fluvie), ('render', fluvie), ('qa', qa), ('import-edit', import_edit), ('annotate', annotate)]:
        p = commands.add_parser(name); p.add_argument('project'); p.set_defaults(func=fn)
        if name in ['qa', 'import-edit']: p.add_argument('file')
        if name == 'soundmap':
            p.add_argument('--transcript')
            p.add_argument('--transcript-time-base', choices=['source'])
            p.add_argument('--threshold-db', type=float, default=-35)
            p.add_argument('--min-pause', type=float, default=.35)
            p.add_argument('--padding', type=float, default=.08)
        if name == 'compose': p.add_argument('--replace', action='store_true')
        if name == 'render':
            p.add_argument('--final', action='store_true'); p.add_argument('--approved', action='store_true')
        if name == 'annotate':
            p.add_argument('--id', required=True); p.add_argument('--start', type=float, required=True); p.add_argument('--end', type=float, required=True)
            p.add_argument('--text', required=True); p.add_argument('--component', default='custom')
            p.add_argument('--presentation', choices=['fullscreen', 'overlay', 'presenter'], default='fullscreen')
    args = parser.parse_args()
    try:
        args.func(args)
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as exc:
        parser.exit(1, f'Error: {exc}\n')


if __name__ == '__main__':
    main()
