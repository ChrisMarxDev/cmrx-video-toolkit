"""Targeted source diagnostics or excerpts of a verified composed render."""
import argparse
from fractions import Fraction
from pathlib import Path
import tempfile
from .common import (digest, entrypoint, finite, identity, interval, output_directory, probe,
                     run, timeline_document, verify_source, versions, write)
from . import receipts


def select_ranges(timeline, clips=(), cuts=(), ranges=(), radius=.75):
    if not finite(radius) or radius <= 0:
        raise ValueError('Preview radius must be positive')
    duration = timeline['duration']; result = []
    by_id = {s['clip_id']: s for s in timeline['spans']}
    for clip in clips:
        if clip not in by_id:
            raise ValueError(f'Unknown clip ID: {clip}')
        s = by_id[clip]; result.append(dict(start=s['output_start'], end=s['output_end'], label=f'clip:{clip}'))
    for index in cuts:
        if type(index) is not int or not 1 <= index < len(timeline['spans']):
            raise ValueError('Cut index is 1-based, between adjacent clips')
        at = timeline['spans'][index]['output_start']
        result.append(dict(start=max(0, at-radius), end=min(duration, at+radius), label=f'cut:{index}'))
    for a, b in ranges:
        interval(a, b, duration); result.append(dict(start=a, end=b, label='range'))
    if not result or len(result) > 50:
        raise ValueError('Select between 1 and 50 preview windows')
    for r in result:
        interval(r['start'], r['end'], duration)
        if r['end']-r['start'] > 30:
            raise ValueError('Diagnostic windows are limited to 30 seconds; select a shorter range')
    return result


def source_parts(timeline, start, end):
    result = []
    for s in timeline['spans']:
        a, b = max(start, s['output_start']), min(end, s['output_end'])
        if a < b:
            offset = s['source_start']-s['output_start']
            result.append(dict(clip_id=s['clip_id'], output_start=a, output_end=b,
                               source_start=a+offset, source_end=b+offset))
    return result


def excerpt(media, parts, destination):
    """Encode only selected windows. Source diagnostic joins are not Fluvie renders."""
    info = probe(media)
    video = next((s for s in info['streams'] if s['codec_type']=='video'), None)
    sound = any(s['codec_type']=='audio' for s in info['streams'])
    if not video and not sound:
        raise ValueError('Preview input has no audio/video')
    graph, labels = [], []
    for i, (a, b) in enumerate(parts):
        if video:
            rate = video.get('avg_frame_rate', '30/1')
            if Fraction(rate) <= 0:
                rate = '30'
            graph.append(f'[0:v:0]trim=start={a}:end={b},setpts=PTS-STARTPTS,scale=w=min(720\\,iw):h=-2,fps={rate},setsar=1[v{i}]')
            labels.append(f'[v{i}]')
        if sound:
            graph.append(f'[0:a:0]atrim=start={a}:end={b},asetpts=PTS-STARTPTS,aresample=48000[a{i}]')
            labels.append(f'[a{i}]')
    outlabels = ('[v]' if video else '')+('[a]' if sound else '')
    graph.append(''.join(labels)+f'concat=n={len(parts)}:v={int(bool(video))}:a={int(sound)}'+outlabels)
    cmd = ['ffmpeg', '-v', 'error', '-nostdin', '-i', media, '-filter_complex_threads', '1', '-filter_complex', ';'.join(graph)]
    if video:
        cmd += ['-map', '[v]', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-crf', '23']
    if sound:
        cmd += ['-map', '[a]', '-c:a', 'aac' if video else 'pcm_s16le']
    run(cmd + [destination])
    return bool(video)


def contact_sheet(media, destination, directory):
    duration = identity(media)['duration']
    paths = []
    samples = [duration*f for f in (.1, .5, .9)]
    for i, seconds in enumerate(samples):
        path = directory/f'frame-{i}.png'
        run(['ffmpeg', '-v', 'error', '-i', media, '-ss', str(seconds), '-frames:v', '1',
             '-vf', 'scale=320:-2', '-threads', '1', path])
        if not path.is_file():
            raise ValueError('Could not capture selected preview frame')
        paths.append(path)
    args = ['ffmpeg', '-v', 'error']
    for path in paths:
        args += ['-i', path]
    run(args+['-filter_complex_threads', '1', '-filter_complex', 'hstack=inputs=3', '-frames:v', '1', '-threads', '1', destination])
    return samples


def build(source, timeline, windows, out, render=None, receipt=None, composition=None):
    mode = 'source-cut-diagnostic'
    evidence = None
    if render:
        if not receipt or not composition:
            raise ValueError('Composed previews need --receipt and --composition')
        evidence = receipts.verify(receipt, render, composition, timeline)
        if evidence['source_sha256'] != source['sha256']:
            raise ValueError('Render receipt source differs from supplied source')
        mode = 'composed-render'
    media = str(Path(render).resolve()) if render else source['path']
    media_identity = identity(media)
    if render and abs(media_identity['duration']-timeline['duration']) > .1:
        raise ValueError('Composed render duration differs from output timeline')
    has_video = any(s['codec_type']=='video' for s in probe(media)['streams'])
    artifacts = []
    for i, window in enumerate(windows):
        parts = source_parts(timeline, window['start'], window['end'])
        intervals = [(window['start'], window['end'])] if render else [(p['source_start'], p['source_end']) for p in parts]
        filename = f'excerpt-{i:03d}'+('.mp4' if has_video else '.wav')
        excerpt(media, intervals, out/filename)
        item = dict(**window, time_base='output', source_parts=parts, media=filename,
                    sha256=identity(out/filename)['sha256'], excerpt_origin=window['start'])
        if has_video:
            sheet = f'contact-{i:03d}.png'
            with tempfile.TemporaryDirectory() as temp:
                item['sample_times_in_excerpt'] = contact_sheet(out/filename, out/sheet, Path(temp))
            item['contact_sheet'] = sheet
        artifacts.append(item)
    verify_source(source); verify_source(media_identity)
    if render:
        receipts.verify(receipt, render, composition, timeline)
    report = dict(format='targeted-previews', version=1, mode=mode, source=source,
                  timeline_revision=timeline['revision'], timeline_sha256=digest(timeline),
                  render=evidence, artifacts=artifacts, tools=versions(), human_review_required=True,
                  limitations=['Excerpts are re-encoded diagnostics; frame/audio packet rounding may shift local boundaries.',
                               'Source diagnostics omit Fluvie graphics, custom components, companions and authored audio effects.',
                               'Use live Fluvie to review the current scene composition; these artifacts do not approve an export.'])
    write(out/'previews.json', report)
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', required=True); p.add_argument('--timeline', required=True); p.add_argument('--output', required=True)
    p.add_argument('--clip-id', action='append', default=[]); p.add_argument('--cut-index', type=int, action='append', default=[])
    p.add_argument('--range', dest='ranges', action='append', default=[], help='Output seconds START:END, repeatable')
    p.add_argument('--radius', type=float, default=.75)
    p.add_argument('--render'); p.add_argument('--receipt'); p.add_argument('--composition')
    a = p.parse_args()
    if not a.render and (a.receipt or a.composition):
        raise ValueError('--receipt/--composition require --render')
    source = identity(a.source); timeline = timeline_document(a.timeline, source)
    windows = select_ranges(timeline, a.clip_id, a.cut_index, [tuple(map(float, r.split(':'))) for r in a.ranges], a.radius)
    with output_directory(a.output) as out:
        build(source, timeline, windows, out, a.render, a.receipt, a.composition)
        if digest(timeline_document(a.timeline, source)) != digest(timeline):
            raise ValueError('Timeline changed during preview')
    print(str(Path(a.output).resolve()/'previews.json'))


if __name__ == '__main__':
    entrypoint(main)
