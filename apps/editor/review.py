"""Shared single-video review format, local preparation and pipeline handoff."""
import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid

from models import resolve_model

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import video

FORMAT = 'video-review'
VERSION = 1


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def fingerprint(path):
    # Full digest prevents a same-named replacement from inheriting another video's review.
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def source_path(document, workspace):
    p = Path(document['source']['path']).expanduser()
    return p.resolve() if p.is_absolute() else (Path(workspace) / p).resolve()


def validate(document):
    if document.get('format') != FORMAT or document.get('version') != VERSION:
        raise ValueError('Expected video-review version 1')
    if type(document.get('revision')) is not int or document['revision'] < 0:
        raise ValueError('Review revision must be a nonnegative integer')
    source = document['source']
    duration = source['duration']
    if not video.finite(duration) or duration <= 0:
        raise ValueError('Source duration must be positive')
    if not isinstance(source['path'], str) or not source['path']:
        raise ValueError('Source path is required')
    for dim in ('width', 'height'):
        if type(source[dim]) is not int or source[dim] <= 0:
            raise ValueError('Invalid source dimensions')
    if not isinstance(source.get('sha256'), str) or len(source['sha256']) != 64:
        raise ValueError('Source fingerprint is required')
    transcript = document['transcript']
    if transcript.get('time_base') != 'source' or transcript.get('granularity') != 'segment':
        raise ValueError('Transcript must declare source time and segment granularity')
    if transcript.get('status') not in ('pending', 'ready'):
        raise ValueError('Invalid transcript status')
    seen = set()
    previous = 0
    for segment in transcript['segments']:
        validate_item(segment, duration, seen)
        if segment['source_start'] < previous - 1e-6:
            raise ValueError('Transcript segments must be ordered and nonoverlapping')
        previous = segment['source_end']
        if not isinstance(segment['text'], str):
            raise ValueError('Transcript text must be text')
    seen = set()
    for mark in document['marks']:
        validate_item(mark, duration, seen)
        if mark['kind'] not in ('good', 'bad', 'comment') or not isinstance(mark['text'], str):
            raise ValueError('Invalid review mark')
    for obj in document['objects']:
        validate_item(obj, duration, seen)
        if not isinstance(obj['text'], str) or not obj['text'].strip():
            raise ValueError('Visual requests need text')
        rect = obj['rect']
        for key in ('x', 'y', 'width', 'height'):
            if not video.finite(rect[key]) or not 0 <= rect[key] <= 1:
                raise ValueError('Rectangle coordinates must be normalized to the video')
        if min(rect['width'], rect['height']) <= 0 or rect['x'] + rect['width'] > 1.000001 or rect['y'] + rect['height'] > 1.000001:
            raise ValueError('Rectangle must fit inside the video')
    # Opposite annotations may overlap; preserve both for downstream interpretation.
    return document


def validate_item(item, duration, seen):
    identifier = item.get('id')
    if not isinstance(identifier, str) or not identifier or identifier in seen:
        raise ValueError('IDs must be nonempty and unique')
    seen.add(identifier)
    video.interval(item['source_start'], item['source_end'], duration)


def normalize_whisper(raw, duration):
    result = []
    for index, row in enumerate(raw['transcription']):
        start, end = row['offsets']['from'] / 1000, row['offsets']['to'] / 1000
        if start >= duration:
            raise ValueError('Transcript extends beyond the source')
        result.append(dict(id=f's{index:06d}', source_start=start, source_end=min(end, duration), text=row['text'].strip()))
    return dict(time_base='source', granularity='segment', status='ready', segments=result)


def run(args, cancel=None):
    # Logs go to disk, not an unbounded pipe; cancellation works during long jobs.
    import tempfile
    with tempfile.TemporaryFile() as log:
        proc = subprocess.Popen([str(a) for a in args], stdout=log, stderr=log)
        while True:
            try:
                code = proc.wait(timeout=.2)
                break
            except subprocess.TimeoutExpired:
                if cancel and cancel.is_set():
                    proc.terminate()
                    try:
                        proc.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait()
                    raise ValueError('Cancelled. Completed preparation stages are kept for retry.')
        if code:
            log.seek(0, 2)
            log.seek(max(0, log.tell() - 6000))
            raise ValueError(f'{Path(str(args[0])).name} failed: ' + log.read().decode('utf-8', 'replace'))
    if cancel and cancel.is_set():
        raise ValueError('Cancelled')


def prepare(source, workspace, model=None, transcript=None, progress=lambda text: None, cancel=None, language="auto"):
    source, workspace = Path(source).expanduser().resolve(), Path(workspace).expanduser().resolve()
    if not source.is_file():
        raise ValueError(f'Video not found: {source}')
    for tool in ('ffmpeg', 'ffprobe'):
        if not shutil.which(tool):
            raise ValueError(f'Preparation needs {tool}. Ask your agent to install it, then Retry; your recording is preserved.')
    workspace.mkdir(parents=True, exist_ok=True)
    target = workspace / 'review.json'
    progress('Checking source recording')
    digest = fingerprint(source)
    if target.exists():
        doc = validate(read(target))
        if doc['source']['sha256'] != digest:
            raise ValueError('This workspace belongs to a different recording. Choose another workspace.')
        doc['source']['path'] = os.path.relpath(source, workspace) if source.is_relative_to(workspace) else str(source)
    else:
        info = video.probe(source)
        picture = next((s for s in info['streams'] if s['codec_type'] == 'video'), None)
        if picture is None or not any(s['codec_type'] == 'audio' for s in info['streams']):
            raise ValueError('Choose one video containing an audio track')
        width, height = picture['width'], picture['height']
        rotation = next((s.get('rotation', 0) for s in picture.get('side_data_list', []) if 'rotation' in s), 0)
        if abs(rotation) % 180 == 90:
            width, height = height, width
        doc = dict(format=FORMAT, version=VERSION, revision=0,
                   source=dict(path=os.path.relpath(source, workspace) if source.is_relative_to(workspace) else str(source),
                               sha256=digest, duration=float(info['format']['duration']), width=width, height=height),
                   transcript=dict(time_base='source', granularity='segment', status='pending', segments=[]), marks=[], objects=[])
        write(target, validate(doc))
    legacy = workspace / 'project.json'
    if doc['transcript']['status'] == 'pending' and legacy.exists() and (workspace / 'transcript.json').exists():
        old = read(legacy)
        if Path(old['source']).expanduser().resolve() != source:
            raise ValueError('Legacy project source differs from this video')
        doc['transcript'] = normalize_whisper(read(workspace / 'transcript.json'), doc['source']['duration'])
        session = read(workspace / 'session.json') if (workspace / 'session.json').exists() else {}
        for index in session.get('removed', []):
            if type(index) is not int or not 0 <= index < len(doc['transcript']['segments']):
                raise ValueError('Legacy cuts do not match the transcript')
            segment = doc['transcript']['segments'][index]
            doc['marks'].append(dict(id='legacy-cut-' + str(index), kind='bad', text='', source_start=segment['source_start'], source_end=segment['source_end']))
        for note in session.get('notes', []):
            doc['marks'].append(dict(id='legacy-note-' + note['id'], kind='comment', text=note['intent'], source_start=note['source_start'], source_end=note['source_end']))
        write(target, validate(doc))
        write(workspace / 'transcript/segments.json', doc['transcript'])
    # Fail before expensive extraction/encoding, retaining the selected source.
    if doc['transcript']['status'] != 'ready' and not transcript:
        cli = os.environ.get('WHISPER_CLI', 'whisper-cli')
        if not shutil.which(cli):
            raise ValueError('Local transcription needs whisper.cpp. Ask your agent to install it, then Retry; your recording is preserved.')
        model = resolve_model(model, progress, cancel)
    media = workspace / 'source'
    media.mkdir(exist_ok=True)
    jobs = [
        ('Extracting narration audio', media / 'audio.wav', ['-vn', '-af', 'aresample=async=1:first_pts=0', '-c:a', 'pcm_s16le']),
        ('Preparing transcription audio', media / 'transcription.wav', ['-vn', '-af', 'aresample=async=1:first_pts=0', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le']),
        ('Preparing browser video', media / 'preview.mp4', ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'])]
    if any(source == destination or source == destination.with_name(destination.stem + '.pending' + destination.suffix) for _, destination, _ in jobs):
        raise ValueError('The original occupies a generated-media path. Choose a separate workspace.')
    for label, destination, options in jobs:
        if cancel and cancel.is_set():
            raise ValueError('Cancelled')
        if not destination.exists():
            progress(label)
            pending = destination.with_name(destination.stem + '.pending' + destination.suffix)
            run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', source, *options, pending], cancel)
            pending.replace(destination)
    raw_path = workspace / 'transcript/whisper.json'
    if doc['transcript']['status'] != 'ready':
        if transcript:
            imported = read(transcript)
            if imported.get('format') == FORMAT:
                validate(imported)
                if imported['source']['sha256'] != digest:
                    raise ValueError('Imported transcript belongs to a different recording')
                if imported['transcript']['status'] != 'ready':
                    raise ValueError('Imported review has no completed transcript')
                doc['transcript'] = imported['transcript']
            else:
                doc['transcript'] = normalize_whisper(imported, doc['source']['duration'])
            write(raw_path, imported)
        else:
            progress('Transcribing locally with whisper.cpp')
            raw_path.parent.mkdir(exist_ok=True)
            if not raw_path.exists():
                pending_base = raw_path.parent / 'whisper.pending'
                run([cli, '-m', Path(model).expanduser(), '-f', media / 'transcription.wav', '-l', language, '-oj', '-of', pending_base], cancel)
                Path(str(pending_base) + '.json').replace(raw_path)
            doc['transcript'] = normalize_whisper(read(raw_path), doc['source']['duration'])
        validate(doc)
        write(workspace / 'transcript/segments.json', doc['transcript'])
        write(target, doc)
    write(target, validate(doc))
    write(workspace / 'transcript/segments.json', doc['transcript'])
    progress('Ready')
    return doc


def retained_ranges(doc):
    # Treat annotations as guidance. Preserve contradictory spans in the rough
    # preview; the composing agent receives both original notes for reconciliation.
    cuts = []
    for bad in (m for m in doc['marks'] if m['kind'] == 'bad'):
        pieces = [(bad['source_start'], bad['source_end'])]
        for good in (m for m in doc['marks'] if m['kind'] == 'good'):
            remaining = []
            for start, end in pieces:
                if good['source_end'] <= start or good['source_start'] >= end:
                    remaining.append((start, end))
                else:
                    if start < good['source_start']:
                        remaining.append((start, good['source_start']))
                    if good['source_end'] < end:
                        remaining.append((good['source_end'], end))
            pieces = remaining
        cuts.extend(pieces)
    cuts.sort()
    result, cursor = [], 0.0
    for start, end in cuts:
        if start > cursor:
            result.append(dict(source_start=cursor, source_end=start))
        cursor = max(cursor, end)
    if cursor < doc['source']['duration']:
        result.append(dict(source_start=cursor, source_end=doc['source']['duration']))
    if not result:
        raise ValueError('Every moment is marked must-cut. Keep some footage before exporting.')
    return result


def export(doc, workspace, render=False, progress=lambda text: None, cancel=None):
    validate(doc)
    if doc['transcript']['status'] != 'ready':
        raise ValueError('Finish or import the transcript before exporting')
    source = source_path(doc, workspace)
    if not source.is_file() or fingerprint(source) != doc['source']['sha256']:
        raise ValueError('Original recording is missing or changed')
    decisions = dict(version=2, videoPath=str(source), retainedRanges=retained_ranges(doc))
    timeline = video.import_cut(decisions, doc['source']['duration'])
    target = Path(workspace) / 'exports' / uuid.uuid4().hex[:12]
    target.mkdir(parents=True)
    notes = []
    for item in doc['marks'] + doc['objects']:
        note = dict(id=item['id'], source_start=item['source_start'], source_end=item['source_end'],
                    intent=item['text'] or {'good': 'Keep suggestion', 'bad': 'Cut suggestion', 'comment': 'Comment'}.get(item.get('kind'), 'Visual request'),
                    component='', presentation='overlay', timing='approximate',
                    kind=item.get('kind', 'visual'), authority='required' if 'rect' in item else 'comment')
        if 'rect' in item:
            note['rect'] = item['rect']
            note['placement'] = 'approximate'
        notes.append(note)
    annotations = dict(version=1, notes=notes)
    resolved = video.map_annotations(annotations, timeline)
    write(target / 'project.json', dict(version=1, name='video-review', source=str(source), fps=30, width=doc['source']['width'], height=doc['source']['height']))
    exported_doc = copy.deepcopy(doc)
    exported_doc['source']['path'] = str(source)
    write(target / 'review.json', exported_doc)
    write(target / 'edit/decisions.json', decisions)
    write(target / 'edit/timeline.json', timeline)
    write(target / 'annotations.json', annotations)
    write(target / 'storyboard/annotations.resolved.json', resolved)
    write(target / 'transcript/segments.json', doc['transcript'])
    mapped_segments = []
    for segment in doc['transcript']['segments']:
        for span in timeline['spans']:
            a, b = max(segment['source_start'], span['source_start']), min(segment['source_end'], span['source_end'])
            if a < b:
                mapped_segments.append(dict(**segment, output_start=span['output_start'] + a - span['source_start'],
                                           output_end=span['output_start'] + b - span['source_start'],
                                           partial=a != segment['source_start'] or b != segment['source_end']))
    write(target / 'transcript/output-segments.json', dict(time_base='output', granularity='segment', segments=mapped_segments))
    # Segment text cannot be split truthfully without alignment. Partial cues are flagged above.
    def stamp(seconds):
        ms = round(seconds * 1000)
        return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    (target / 'transcript/output.srt').write_text('\n'.join(f"{i+1}\n{stamp(s['output_start'])} --> {stamp(s['output_end'])}\n{s['text']}\n" for i, s in enumerate(mapped_segments)), encoding='utf-8')
    for folder in ('composition/assets', 'composition/lib', 'renders', 'review'):
        (target / folder).mkdir(parents=True, exist_ok=True)
    (target / 'HANDOFF.md').write_text('''# Single-video review handoff

Read review.json and storyboard/annotations.resolved.json before composing.
Good and bad are keep/cut suggestions, not binding decisions. They may overlap.
Preserve both notes and reconcile their intent when composing. The optional rough
cut retains good/bad overlaps and removes only unopposed bad ranges.
Visual requests are required intent. Coordinates and source-time ranges are
approximate guidance: creatively refine placement and timing, preserve the wish.
Add your own visuals where useful. Do not limit the composition to these requests.
This export is a deterministic rough cut at the selected boundaries, not a claim
that those boundaries are frame-perfect editorial decisions. If refining cuts,
use edit/decisions.json and the pipeline import-edit command to rebuild mappings.
Never silently discard conflicting requests: removed-by-edit objects need review.
Rectangles use normalized displayed source-video coordinates, excluding letterbox.
Transcript timestamps have segment precision, not word alignment. Partial output
segments retain the whole segment text and are flagged; review captions at cuts.
Source and output clocks remain distinct. Original media is never modified.
The project references local original media; copy/relink that media when moving it.
''', encoding='utf-8')
    if render:
        progress('Rendering rough cut')
        filters, streams = [], []
        for i, span in enumerate(timeline['spans']):
            a, b = span['source_start'], span['source_end']
            filters.extend([f'[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS,scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30[v{i}]', f'[0:a]atrim=start={a}:end={b},asetpts=PTS-STARTPTS[a{i}]'])
            streams.append(f'[v{i}][a{i}]')
        filters.append(''.join(streams) + f'concat=n={len(streams)}:v=1:a=1[v][a]')
        graph = target / 'edit/filtergraph.txt'
        graph.write_text(';\n'.join(filters), encoding='utf-8')
        cut = target / 'composition/assets/rough-cut.mp4'
        run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', source, *video.filter_graph_args(graph), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-c:a', 'aac', '-movflags', '+faststart', cut], cancel)
        if abs(float(video.probe(cut)['format']['duration']) - timeline['duration']) > .15:
            raise ValueError(f'Render timing drift exceeds 150 ms; inspect {target}')
        run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', cut, '-vn', '-c:a', 'pcm_s16le', target / 'edit/narration.wav'], cancel)
        write(target / 'edit/cut-manifest.json', dict(timeline_revision=timeline['revision'], output=str(cut)))
    progress('Export complete')
    return str(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video')
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--model')
    parser.add_argument('--language', default='auto', help='Whisper decoding language, e.g. auto, de or en; never enables translation')
    parser.add_argument('--transcript', help='Existing whisper.cpp JSON or video-review document')
    args = parser.parse_args()
    try:
        prepare(args.video, args.workspace, args.model, args.transcript, progress=print, language=args.language)
        print(Path(args.workspace).resolve() / 'review.json')
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        parser.exit(1, f'{exc}\n')


if __name__ == '__main__':
    main()
