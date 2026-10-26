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
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from fluvie_project import settings, PIN
from validate_fluvie import validate


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


def file_digest(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def identify_spans(spans, ranges=None):
    """IDs are editorial identity, not media-cache keys or output positions."""
    seen = set()
    for i, span in enumerate(spans):
        supplied = ranges[i].get('clip_id') if ranges is not None else None
        identity = supplied if supplied is not None else 'clip_' + digest(
            [float(span['source_start']), float(span['source_end'])])[:12]
        if not isinstance(identity, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,63}', identity):
            raise ValueError('clip_id must start with a letter and contain at most 64 letters, digits, _ or -')
        if identity in seen:
            raise ValueError(f'Duplicate clip_id: {identity}')
        seen.add(identity)
        span['clip_id'] = identity


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
        identify_spans(spans, ranges)
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
    identify_spans(spans)
    result = dict(version=1, source_duration=duration, duration=cursor, spans=spans, words=retained,
                  edit_digest=digest(data))
    result['revision'] = digest(result)
    return result


def remap_words(timeline, evidence):
    """Retain only whole, measured source words; never invent cut-word timing."""
    while evidence.get('provenance'):
        evidence = evidence['provenance']
    if evidence.get('version') != 1:
        return
    words, partial = [], []
    for i, word in enumerate(evidence.get('words', [])):
        a, b = word['start'], word['end']
        for span in timeline['spans']:
            if max(a, span['source_start']) >= min(b, span['source_end']):
                continue
            if a < span['source_start'] or b > span['source_end']:
                partial.append(f'w{i:06d}')
                continue
            offset = span['output_start'] - span['source_start']
            words.append(dict(id=f'w{i:06d}', text=word['word'], source_start=a,
                              source_end=b, start=a+offset, end=b+offset))
    timeline['words'] = words
    timeline['partial_word_ids'] = partial
    timeline['revision'] = digest({k: v for k, v in timeline.items() if k != 'revision'})


def remap_transcript(p, timeline):
    source = p / 'transcript/segments.json'
    mapped = []
    if source.exists():
        for segment in read(source)['segments']:
            for span in timeline['spans']:
                a = max(segment['source_start'], span['source_start'])
                b = min(segment['source_end'], span['source_end'])
                if a < b:
                    mapped.append(dict(**segment,
                        output_start=span['output_start'] + a - span['source_start'],
                        output_end=span['output_start'] + b - span['source_start'],
                        partial=a != segment['source_start'] or b != segment['source_end']))
    # Always replace derived artifacts, including when source timing is absent.
    write(p / 'transcript/output-segments.json', dict(time_base='output',
          timeline_revision=timeline['revision'], granularity='segment', segments=mapped,
          status='needs-caption-review' if any(x['partial'] for x in mapped) else
                 ('mapped' if source.exists() else 'source-transcript-unavailable')))
    def stamp(seconds):
        ms = round(seconds * 1000)
        return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    # A truncated segment's full text is evidence, not a valid subtitle.
    cues = [x for x in mapped if not x['partial']]
    if not source.exists():
        cues = [dict(text=w['text'], output_start=w['start'], output_end=w['end'])
                for w in timeline['words']]
    target = p / 'transcript/output.srt'
    temporary = target.with_suffix('.srt.tmp')
    temporary.write_text(''.join(f"{i+1}\n{stamp(x['output_start'])} --> {stamp(x['output_end'])}\n{x['text']}\n\n"
                                 for i, x in enumerate(cues)), encoding='utf-8')
    temporary.replace(target)


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


def composition_dir(p):
    relative = read(p / 'project.json').get('composition_project', 'composition')
    root = (p / relative).resolve()
    if root == p or not root.is_relative_to(p):
        raise ValueError('composition_project must name a directory inside the video workspace')
    return root


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
    # Preserve identities of exact surviving ranges on ID-less reimports. Do not
    # guess identity from overlap (splits/merges need explicit editorial IDs).
    previous_path = p / 'edit/timeline.json'
    if previous_path.exists():
        old = read(previous_path)
        by_range = {(s['source_start'], s['source_end']): s.get('clip_id') for s in old['spans']}
        explicit = {i for i, r in enumerate(data.get('retainedRanges', [])) if 'clip_id' in r}
        for i, span in enumerate(timeline['spans']):
            identity = by_range.get((span['source_start'], span['source_end']))
            if i not in explicit and identity:
                span['clip_id'] = identity
        identify_spans(timeline['spans'], timeline['spans'])
        timeline['revision'] = digest({k: v for k, v in timeline.items() if k != 'revision'})
    validate_companion_ranges(read(p / 'project.json'), timeline)
    remap_words(timeline, data)
    mapped = map_annotations(read(p / 'annotations.json'), timeline)
    remap_transcript(p, timeline)
    write(p / 'edit/decisions.json', data)
    write(p / 'edit/timeline.json', timeline)
    write(p / 'storyboard/annotations.resolved.json', mapped)
    print(f"Imported {len(timeline['spans'])} clips; {timeline['duration']:.3f}s. Run prepare-clips and reconcile the composition.")


def adjust_clip(args):
    """Change source boundaries, preserving clip identity and remapping all cues."""
    p = project_dir(args.project)
    timeline = read(p / 'edit/timeline.json')
    ranges = [{k: s[k] for k in ('clip_id', 'source_start', 'source_end')}
              for s in timeline['spans']]
    selected = next((s for s in ranges if s['clip_id'] == args.clip_id), None)
    if selected is None:
        raise ValueError(f'Unknown clip_id: {args.clip_id}')
    if args.start is None and args.end is None:
        raise ValueError('Supply --start and/or --end in original-source seconds')
    if args.start is not None:
        selected['source_start'] = args.start
    if args.end is not None:
        selected['source_end'] = args.end
    config = read(p / 'project.json')
    duration = float(probe(config['source'])['format']['duration'])
    decisions = read(p / 'edit/decisions.json')
    # Preserve imported evidence. Boundary edits are now explicit range decisions;
    # the original word decisions remain attached as provenance, not mixed input.
    data = dict(version=2, videoPath=config['source'], retainedRanges=ranges,
                provenance=decisions.get('provenance', decisions))
    updated = import_cut(data, duration)  # validates source bounds and neighbors
    validate_companion_ranges(config, updated)
    remap_words(updated, data)
    mapped = map_annotations(read(p / 'annotations.json'), updated)
    remap_transcript(p, updated)
    write(p / 'edit/decisions.json', data)
    write(p / 'edit/timeline.json', updated)
    write(p / 'storyboard/annotations.resolved.json', mapped)
    print(f"Updated {args.clip_id}; {updated['duration']:.3f}s total. Run prepare-clips, then reconcile scene durations and cues. Measured words and source captions have been remapped; partial cues need review.")


def companion_sources(config, require_files=True):
    """Companion time = primary time + offset; primary remains the edit clock."""
    values = config.get('companions', [])
    if not isinstance(values, list):
        raise ValueError('companions must be a list')
    result, seen = [], {'primary'}
    for item in values:
        if not isinstance(item, dict):
            raise ValueError('Each companion must be an object')
        identity, offset = item.get('id'), item.get('offset_seconds', 0)
        if not isinstance(identity, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,63}', identity):
            raise ValueError('Companion id must start with a letter and contain at most 64 letters, digits, _ or -')
        if identity in seen:
            raise ValueError(f'Duplicate or reserved companion id: {identity}')
        if not finite(offset):
            raise ValueError('Companion offset_seconds must be finite')
        if not isinstance(item.get('path'), str) or not Path(item['path']).expanduser().is_absolute():
            raise ValueError('Companion path must be absolute')
        source = Path(item['path']).expanduser().resolve()
        if require_files and not source.is_file():
            raise ValueError(f'Missing companion recording: {source}')
        seen.add(identity)
        result.append(dict(id=identity, path=str(source), offset_seconds=float(offset)))
    return result


def validate_companion_ranges(config, timeline):
    sources = companion_sources(config)
    for item in sources:
        info = probe(item['path'])
        videos = [v for v in info['streams'] if v['codec_type'] == 'video']
        if not videos:
            raise ValueError(f'Companion {item["id"]} needs a video stream')
        # The selected video must cover the range, not merely a longer audio stream.
        duration = float(videos[0].get('duration', info['format']['duration']))
        for span in timeline['spans']:
            start, end = (span[k] + item['offset_seconds'] for k in ('source_start', 'source_end'))
            try:
                interval(start, end, duration)
            except ValueError as exc:
                raise ValueError(f'Companion {item["id"]} does not cover clip {span["clip_id"]}: {exc}') from exc
    return sources


def link_source(args):
    p = project_dir(args.project)
    config = read(p / 'project.json')
    current = companion_sources(config, require_files=False)
    if args.remove:
        if not any(x['id'] == args.source_id for x in current):
            raise ValueError(f'Unknown companion: {args.source_id}')
        config['companions'] = [x for x in current if x['id'] != args.source_id]
    else:
        if not args.source:
            raise ValueError('--source is required unless --remove is used')
        candidate = dict(id=args.source_id, path=str(Path(args.source).expanduser().resolve()),
                         offset_seconds=args.offset)
        config['companions'] = [x for x in current if x['id'] != args.source_id] + [candidate]
    companion_sources(config)
    if (p / 'edit/timeline.json').exists():
        validate_companion_ranges(config, read(p / 'edit/timeline.json'))
    write(p / 'project.json', config)
    print('Linked sources updated. Run prepare-clips and reconcile the composition before preview/export.')


def clip_profile(config):
    fps = config['fps']
    if not finite(fps) or fps <= 0:
        raise ValueError('Project fps must be positive and finite')
    return dict(version=2, fps=fps, video_codec='libx264', preset='fast', crf=18,
                pixel_format='yuv420p', audio_codec='aac', sample_rate=48000,
                video_filter=config.get('media', {}).get('video_filter', ''),
                audio_filter=config.get('media', {}).get('audio_filter', ''),
                hdr_to_sdr=config.get('media', {}).get('hdr_to_sdr', False),
                ffmpeg=config.get('media', {}).get('ffmpeg', 'ffmpeg'))


def write_clip_dart(p, clips, companions=None):
    """Generated data only; never rewrite the agent's authored scene widgets."""
    rows = '\n'.join(
        '  SourceClip(' + ', '.join([dart_string(c['clip_id']), dart_string(c['asset']),
                                   *[str(float(c[k])) for k in ('source_start', 'source_end', 'output_start', 'output_end')]]) + '),'
        for c in clips)
    linked_rows = '\n'.join(
        '  ' + dart_string(source['id']) + ': <SourceClip>[\n' + '\n'.join(
            '    SourceClip(' + ', '.join([dart_string(c['clip_id']), dart_string(c['asset']),
                *[str(float(c[k])) for k in ('source_start', 'source_end', 'output_start', 'output_end')]]) + '),'
            for c in source['clips']) + '\n  ],'
        for source in (companions or []))
    target = composition_dir(p) / 'lib/source_clips.dart'
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.dart.tmp')
    temporary.write_text('''// Generated by prepare-clips. Author visuals in other files.
class SourceClip {
  const SourceClip(this.id, this.asset, this.sourceStart, this.sourceEnd, this.outputStart, this.outputEnd);
  final String id, asset;
  final double sourceStart, sourceEnd, outputStart, outputEnd;
  double get duration => sourceEnd - sourceStart;
}

const sourceClips = <SourceClip>[
''' + rows + '''
];
const companionClips = <String, List<SourceClip>>{
''' + linked_rows + '''
};
SourceClip sourceClip(String id, {String sourceId = 'primary'}) =>
    (sourceId == 'primary' ? sourceClips : companionClips[sourceId] ??
      (throw ArgumentError('Unknown source: $sourceId')))
        .firstWhere((clip) => clip.id == id);
''', encoding='utf-8')
    temporary.replace(target)


def prepare_source_clips(p, config, timeline, silent=False):
    source = Path(config['source']).resolve()
    source_hash = file_digest(source)
    profile = clip_profile(config)
    if silent:
        profile = {**profile, 'audio_mode': 'silent', 'audio_filter': ''}
    source_info = probe(source)
    if any(s.get('color_transfer') in ('arib-std-b67', 'smpte2084') for s in source_info['streams']) and not profile['hdr_to_sdr']:
        raise ValueError('HDR footage needs explicit color-managed preparation before the SDR clip encoder; preserve original-source provenance')
    clips, encoded = [], 0
    folder = composition_dir(p) / 'assets/clips'
    folder.mkdir(parents=True, exist_ok=True)
    for span in timeline['spans']:
        start, end = span['source_start'], span['source_end']
        interval(start, end, timeline['source_duration'])
        key = digest(dict(source_sha256=source_hash, source_start=float(start),
                          source_end=float(end), profile=profile))
        target, sidecar = folder / f'{key}.mp4', folder / f'{key}.json'
        cached = None
        if target.exists() and sidecar.exists():
            try:
                candidate = read(sidecar)
                if (candidate['key'] == key and finite(candidate.get('media_duration')) and
                        candidate['sha256'] == file_digest(target)):
                    cached = candidate
            except (ValueError, KeyError, TypeError):
                pass
        if cached is None:
            # Seek before decoding; accurate input seek discards frames before the
            # requested boundary when transcoding. Each proxy starts at local zero.
            temporary = folder / f'{key}.pending.mp4'
            try:
                vf = []
                if profile['hdr_to_sdr']:
                    vf.append('zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv')
                if profile['video_filter']:
                    vf.append(profile['video_filter'])
                vf.append(f'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps={profile["fps"]}')
                audio_args = ['-af', profile['audio_filter']] if profile['audio_filter'] else []
                color_args = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'] if profile['hdr_to_sdr'] else []
                run([profile['ffmpeg'], '-nostdin', '-v', 'error', '-y', '-ss', start, '-i', source,
                     '-t', end - start, '-map', '0:v:0',
                     *(['-an'] if silent else ['-map', '0:a:0']),
                     '-vf', ','.join(vf), *audio_args, *color_args, '-c:v', profile['video_codec'], '-preset', profile['preset'],
                     '-crf', profile['crf'], '-pix_fmt', profile['pixel_format'],
                     *([] if silent else ['-c:a', profile['audio_codec'], '-ar', profile['sample_rate']]),
                     '-movflags', '+faststart', temporary])
                info = probe(temporary)
                streams = info['streams']
                if not ({'video'} if silent else {'audio', 'video'}) <= {s['codec_type'] for s in streams}:
                    raise ValueError('Clip preparation requires video (and audio for the primary source)')
                media_duration = float(info['format']['duration'])
                if abs(media_duration - (end - start)) > max(1 / profile['fps'], 1024 / 48000) + .005:
                    raise ValueError(f'Clip duration mismatch for {span["clip_id"]}')
                cached = dict(key=key, sha256=file_digest(temporary), media_duration=media_duration)
                temporary.replace(target)
                write(sidecar, cached)
                encoded += 1
            finally:
                temporary.unlink(missing_ok=True)
        clips.append({**span, 'asset': f'assets/clips/{key}.mp4', 'cache_key': key,
                      'sha256': cached['sha256'], 'media_duration': cached['media_duration']})
    if file_digest(source) != source_hash:
        raise ValueError('Original source changed during clip preparation; retry with stable media')
    return dict(source=str(source), source_sha256=source_hash, profile=profile, clips=clips), encoded


def prepare_clips(args):
    p = project_dir(args.project)
    config, timeline = read(p / 'project.json'), read(p / 'edit/timeline.json')
    if any('clip_id' not in s for s in timeline['spans']):
        raise ValueError('Timeline predates clip IDs; reimport edit/decisions.json first')
    sources = validate_companion_ranges(config, timeline)
    primary, encoded = prepare_source_clips(p, config, timeline)
    companions = []
    for item in sources:
        offset = item['offset_seconds']
        linked_timeline = {**timeline, 'source_duration': float(probe(item['path'])['format']['duration']),
            'spans': [{**span, 'source_start': span['source_start'] + offset,
                      'source_end': span['source_end'] + offset} for span in timeline['spans']]}
        prepared, count = prepare_source_clips(p, {**config, 'source': item['path']}, linked_timeline, silent=True)
        companions.append({**item, **prepared})
        encoded += count
    # Check all sources again after the whole batch, before publishing either handoff.
    for source in [primary, *companions]:
        if file_digest(source['source']) != source['source_sha256']:
            raise ValueError('Original source changed during clip preparation; retry with stable media')
    manifest = dict(version=1, timeline_revision=timeline['revision'], **primary)
    if companions:
        manifest.update(version=2, companions=companions)
    write_clip_dart(p, primary['clips'], companions)
    write(p / 'edit/clips.json', manifest)
    count = len(primary['clips']) + sum(len(x['clips']) for x in companions)
    print(json.dumps(dict(manifest=str(p / 'edit/clips.json'), encoded=encoded,
                          reused=count - encoded, clips=count)))


def checked_clips(p, timeline):
    manifest = read(p / 'edit/clips.json')
    config = read(p / 'project.json')
    if (manifest['timeline_revision'] != timeline['revision'] or
            manifest['profile'] != clip_profile(config) or
            manifest['source_sha256'] != file_digest(config['source'])):
        raise ValueError('Prepared clips are stale; run prepare-clips and reconcile the composition')
    sources = companion_sources(config)
    prepared = manifest.get('companions', [])
    if [{k: x[k] for k in ('id', 'path', 'offset_seconds')} for x in prepared] != sources:
        raise ValueError('Linked sources changed; run prepare-clips and reconcile the composition')
    for source in prepared:
        if file_digest(source['path']) != source['source_sha256']:
            raise ValueError('Linked source changed; run prepare-clips')
    for clip in [*manifest['clips'], *(c for source in prepared for c in source['clips'])]:
        if file_digest(composition_dir(p) / clip['asset']) != clip['sha256']:
            raise ValueError('Prepared clip changed; run prepare-clips')
    return manifest


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
    prepare_clips(args)
    clips = checked_clips(p, timeline)['clips']
    inputs, filters, streams = [], [], []
    for i, clip in enumerate(clips):
        inputs += ['-i', composition_dir(p) / clip['asset']]
        duration = clip['source_end'] - clip['source_start']
        filters += [f'[{i}:v]trim=duration={duration},setpts=PTS-STARTPTS[v{i}]',
                    f'[{i}:a]atrim=duration={duration},asetpts=PTS-STARTPTS[a{i}]']
        streams.append(f'[v{i}][a{i}]')
    filters.append(''.join(streams) + f'concat=n={len(streams)}:v=1:a=1[v][a]')
    graph = p / 'edit/filtergraph.txt'
    graph.write_text(';\n'.join(filters))
    target = composition_dir(p) / 'assets/rough-cut.mp4'
    temporary = target.with_name('rough-cut.pending.mp4')
    run(['ffmpeg', '-nostdin', '-v', 'error', '-y', *inputs, *filter_graph_args(graph),
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
    composition = composition_dir(p)
    runtime = settings(composition)
    main = Path(runtime['path'])
    authored = [f for f in (composition / 'lib').rglob('*.dart') if f.name != 'source_clips.dart']
    if (main.exists() or authored) and not args.replace:
        raise ValueError('Composition exists. Edit it directly, or explicitly pass --replace to regenerate.')
    clips = checked_clips(p, timeline)
    companion = getattr(args, 'companion', None)
    if companion and companion not in {x['id'] for x in clips.get('companions', [])}:
        raise ValueError(f'Unknown prepared companion: {companion}')
    main.parent.mkdir(parents=True, exist_ok=True)
    package = Path(os.environ.get('CMRX_COMPONENT_PACKAGE', str(ROOT / 'components')))
    package_name = os.environ.get('CMRX_COMPONENT_NAME', 'video_components')
    token_class = os.environ.get('CMRX_TOKEN_CLASS')
    background = f'{token_class}.ink' if token_class else 'const Color(0xFF000000)'
    pubspec = composition / 'pubspec.yaml'
    if not pubspec.exists():
        pubspec.write_text(f'''name: video_composition
publish_to: none
environment:
  sdk: '>=3.12.0 <4.0.0'
dependencies:
  flutter:
    sdk: flutter
  fluvie:
    git:
      url: https://github.com/SimonErich/fluvie.git
      ref: {PIN}
      path: packages/fluvie
  {package_name}:
    path: {package}
dependency_overrides:
  fluvie:
    git:
      url: https://github.com/SimonErich/fluvie.git
      ref: {PIN}
      path: packages/fluvie
  fluvie_media:
    git:
      url: https://github.com/SimonErich/fluvie.git
      ref: {PIN}
      path: packages/fluvie_media
dev_dependencies:
  flutter_test:
    sdk: flutter
  alchemist: ^0.14.0
flutter:
  uses-material-design: true
  assets:
    - assets/
    - assets/clips/
''')
    scene_code = f'''for (final clip in sourceClips) Scene(
    duration: clip.duration.seconds,
    background: Background.color({background}),
    children: [Clip.asset(clip.asset,
      trim: 0.seconds.to(clip.duration.seconds), fit: BoxFit.contain)],
  )'''
    if companion:
        scene_code = f'''for (final clip in sourceClips) Scene(
    duration: clip.duration.seconds,
    background: Background.color({background}),
    children: [Row(children: [
      Expanded(child: Clip.asset(clip.asset,
        trim: 0.seconds.to(clip.duration.seconds), fit: BoxFit.contain)),
      Expanded(child: Clip.asset(sourceClip(clip.id, sourceId: {dart_string(companion)}).asset,
        trim: 0.seconds.to(clip.duration.seconds),
        audio: const ClipAudio.muted(), fit: BoxFit.contain)),
    ])],
  )'''
    clip_import = os.path.relpath(composition / 'lib/source_clips.dart', main.parent).replace(os.sep, '/')
    main.write_text(f'''import 'package:flutter/widgets.dart' hide Animation, Clip, Image, Tween;
import 'package:fluvie/fluvie.dart';
import 'package:{package_name}/{package_name}.dart';
import '{clip_import}';

// Baseline composition. Author scene visuals here; source_clips.dart is generated.
// Keep each scene's narration-bearing Clip mounted under its graphics.
Video {runtime['draftEntry']}() => draftVideo({runtime['entry']}());

Video {runtime['entry']}() => Video(
  size: const VideoSize({config.get('width', 1920)}, {config.get('height', 1080)}),
  fps: {config['fps']},
  scenes: [{scene_code}],
);
''')
    write(composition / 'manifest.json', dict(timeline_revision=timeline['revision'],
                                             media_mode='clips',
                                             clips_digest=digest(clips),
                                             note='Baseline footage; agent authors animations from storyboard.'))
    print(main)


def fluvie(args):
    p = project_dir(args.project)
    timeline = read(p / 'edit/timeline.json')
    manifest = read(composition_dir(p) / 'manifest.json')
    files = [composition_dir(p) / 'manifest.json']
    if manifest.get('media_mode') == 'clips':
        clips = checked_clips(p, timeline)
        if manifest.get('clips_digest') != digest(clips):
            raise ValueError('Composition clip inputs are stale; reconcile the composition and its clips_digest')
    else:
        files.append('edit/cut-manifest.json')
    for file in files:
        if read(p / file)['timeline_revision'] != timeline['revision']:
            raise ValueError(f'{file} is stale. Reconcile narration and animation before proceeding.')
    if args.command == 'render' and args.final and not args.approved:
        raise ValueError('Final export needs --approved after the user approves the preview. Use draft otherwise.')
    runtime = settings(composition_dir(p))
    command = [runtime['executable'], 'preview' if args.command == 'preview' else 'render',
               runtime['path'], '--project', str(composition_dir(p)), '--entry', runtime['entry']]
    if args.command == 'preview':
        command += ['--device', 'web-server', '--toolchain', 'system', '--no-download']
    if args.command == 'render':
        validation = validate(runtime['path'], project=composition_dir(p), fluvie_bin=runtime['executable'])
        write(p / 'review/validation.json', validation)
        if not validation['ok']:
            raise ValueError('Static validation failed or unavailable; inspect review/validation.json')
        config = read(p / 'project.json')
        scale = 1 if args.final else .5
        estimate = config.get('width', 1920) * config.get('height', 1080) * scale ** 2 * 4 * config['fps'] * timeline['duration']
        available = shutil.disk_usage(tempfile.gettempdir()).free
        if estimate * 1.25 > available:
            raise ValueError(f'Raw capture needs about {estimate / 1e9:.1f} GB plus headroom; only {available / 1e9:.1f} GB free in the temp directory. Set TMPDIR to a larger disk or shorten the render.')
        target = p / 'renders' / ('final.mp4' if args.final else 'draft.mp4')
        command += ['--out', str(target), '--quality', 'high' if args.final else 'low']
        if not args.final:
            command[command.index('--entry') + 1] = runtime['draftEntry']
    run(command, cwd=composition_dir(p))


def qa(args):
    p = project_dir(args.project)
    target = Path(args.file).resolve()
    info, timeline = probe(target), read(p / 'edit/timeline.json')
    config = read(p / 'project.json')
    counted = json.loads(run(['ffprobe', '-v', 'error', '-count_frames', '-show_streams',
                              '-of', 'json', target], capture_output=True, text=True).stdout)
    picture = next((x for x in counted['streams'] if x['codec_type'] == 'video'), {})
    audio = next((x for x in info['streams'] if x['codec_type'] == 'audio'), {})
    scale = .5 if getattr(args, 'draft', False) else 1
    expected_frames = round(timeline['duration'] * config['fps'])
    def rate(value):
        a, b = value.split('/')
        return float(a) / float(b) if float(b) else 0
    decode = subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(target),
                             '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'],
                            capture_output=True, text=True)
    tolerance = max(1 / config['fps'], 1024 / 48000) + .005
    delta = abs(float(info['format']['duration']) - timeline['duration'])
    checks = dict(full_decode=decode.returncode == 0, has_video=bool(picture), has_audio=bool(audio),
        duration=delta <= tolerance,
        frame_count=abs(int(picture.get('nb_read_frames', -999)) - expected_frames) <= 1,
        fps=abs(rate(picture.get('avg_frame_rate', '0/1')) - config['fps']) < .001,
        resolution=(picture.get('width'), picture.get('height')) ==
                   (int(config.get('width', 1920)*scale), int(config.get('height', 1080)*scale)),
        audio_duration=abs(float(audio.get('duration', -999)) - timeline['duration']) <= tolerance)
    result = dict(file=str(target), timeline_revision=timeline['revision'], duration_delta=delta,
        checks=checks, passed=all(checks.values()), expected_frames=expected_frames,
        measured_frames=picture.get('nb_read_frames'), decode_error=decode.stderr[-2000:],
        manual_checks_pending=['speech/lip sync', 'visual transitions', 'caption correctness', 'creative acceptance'])
    write(p / 'review/media-check.json', result)
    samples = sorted(set([timeline['duration'] * f for f in (.1, .5, .9)] +
        [max(0, min(timeline['duration'] - 1/config['fps'], span['output_start'] + offset/config['fps']))
         for span in timeline['spans'][1:] for offset in (-1, 0, 1)]))
    for i, seconds in enumerate(samples):
        run(['ffmpeg', '-v', 'error', '-y', '-ss', str(seconds), '-i', target,
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
    for name, fn in [('link-source', link_source), ('soundmap', soundmap), ('inspect', inspect), ('cut', cut), ('prepare-clips', prepare_clips), ('adjust-clip', adjust_clip), ('compose', compose), ('preview', fluvie), ('render', fluvie), ('qa', qa), ('import-edit', import_edit), ('annotate', annotate)]:
        p = commands.add_parser(name); p.add_argument('project'); p.set_defaults(func=fn)
        if name == 'link-source':
            p.add_argument('source_id')
            p.add_argument('--source')
            p.add_argument('--offset', type=float, default=0, help='Companion time = primary time + offset seconds')
            p.add_argument('--remove', action='store_true')
        if name in ['qa', 'import-edit']: p.add_argument('file')
        if name == 'qa':
            p.add_argument('--draft', action='store_true', help='Expect half-resolution draft output')
        if name == 'soundmap':
            p.add_argument('--transcript')
            p.add_argument('--transcript-time-base', choices=['source'])
            p.add_argument('--threshold-db', type=float, default=-35)
            p.add_argument('--min-pause', type=float, default=.35)
            p.add_argument('--padding', type=float, default=.08)
        if name == 'compose':
            p.add_argument('--replace', action='store_true')
            p.add_argument('--companion', help='Optional linked source ID for a side-by-side baseline')
        if name == 'adjust-clip':
            p.add_argument('clip_id')
            p.add_argument('--start', type=float, help='New start in original-source seconds')
            p.add_argument('--end', type=float, help='New end in original-source seconds')
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
