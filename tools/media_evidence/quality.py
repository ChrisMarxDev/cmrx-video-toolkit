"""Measured media/cut evidence; thresholds flag review candidates, never authorize edits."""
import argparse
import math
from pathlib import Path
import re
from .common import (audio, digest, entrypoint, finite, identity, output_directory,
                     probe, read, run, timeline_document, verify_source, versions, write)
from .speech import validate_evidence


def number(value):
    try:
        x = float(value)
        return x if math.isfinite(x) else None
    except (ValueError, TypeError):
        return None


def parse_metrics(stderr, duration):
    black = [dict(start=float(a), end=float(b)) for a,b in
             re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', stderr)]
    silence, opened = [], None
    for line in stderr.splitlines():
        start = re.search(r'silence_start: (-?[\d.]+)', line)
        end = re.search(r'silence_end: (-?[\d.]+)', line)
        if start:
            opened = max(0., float(start[1]))
        if end and opened is not None:
            silence.append(dict(start=opened, end=min(duration, float(end[1])))); opened = None
    if opened is not None:
        silence.append(dict(start=opened, end=duration))
    summary = stderr[stderr.rfind('Summary:'):]
    loudness = re.search(r'I:\s+(-?[\d.inf]+) LUFS', summary)
    peak = re.search(r'Peak:\s+(-?[\d.inf]+) dBFS', summary)
    lufs = number(loudness[1]) if loudness else None
    return dict(black=black, silence=silence,
                integrated_lufs=lufs if lufs is not None and lufs > -70 else None,
                true_peak_dbtp=number(peak[1]) if peak else None)


def measure(path, silence_db=-40., minimum=.2, black_pixel=.1, black_share=.98):
    if not finite(silence_db) or not -120 <= silence_db <= 0:
        raise ValueError('Silence threshold must be between -120 and 0 dBFS')
    if not finite(minimum) or minimum <= 0 or not all(finite(v) and 0 <= v <= 1 for v in (black_pixel, black_share)):
        raise ValueError('Invalid minimum duration or black thresholds')
    info = probe(path); duration = float(info['format']['duration'])
    sound = any(s['codec_type']=='audio' for s in info['streams'])
    video = any(s['codec_type']=='video' for s in info['streams'])
    cmd = ['ffmpeg', '-hide_banner', '-nostdin', '-i', path]
    if video:
        cmd += ['-map', '0:v:0', '-vf', f'blackdetect=d={minimum}:pix_th={black_pixel}:pic_th={black_share}']
    if sound:
        cmd += ['-map', '0:a:0', '-af', f'silencedetect=n={silence_db}dB:d={minimum},ebur128=peak=true:framelog=quiet']
    result = parse_metrics(run(cmd+['-f', 'null', '-']).stderr.decode(errors='replace'), duration)
    if not sound:
        result.update(silence=None, integrated_lufs=None, true_peak_dbtp=None)
    if not video:
        result['black'] = None
    return dict(**result, settings=dict(silence_db=silence_db, minimum_seconds=minimum,
                                       black_pixel_threshold=black_pixel, black_picture_share=black_share),
                interpretation='Measurements only; silence/black can be intentional. Null means unavailable or below measurement gate.')


def rms(values):
    energy = math.sqrt(sum(x*x for x in values)/len(values))
    return 20*math.log10(energy) if energy > 0 else None


def activity_at(report, a, b):
    if report is None:
        return None
    samples = [(f['probability'], max(0, min(b,f['source_end'])-max(a,f['source_start']))) for f in report['activity']]
    covered = sum(w for _,w in samples)
    if covered < (b-a)*.95:
        return None
    return sum(p*w for p,w in samples)/covered


def cut_facts(source, timeline, speech=None, window=.04, jump_threshold=.2):
    if not finite(window) or not 0 < window <= 1 or not finite(jump_threshold) or not 0 <= jump_threshold <= 2:
        raise ValueError('Invalid cut measurement window/threshold')
    sound = any(s['codec_type']=='audio' for s in probe(source['path'])['streams'])
    report = validate_evidence(speech, source) if speech is not None else None
    facts = []
    for index, (left, right) in enumerate(zip(timeline['spans'], timeline['spans'][1:]), 1):
        a, b = left['source_end'], right['source_start']
        left_start, right_end = max(left['source_start'],a-window), min(right['source_end'],b+window)
        words = []
        if report:
            for side, at in [('out',a), ('in',b)]:
                for word in report['words']:
                    if word['source_start'] is not None and word['source_start'] < at < word['source_end']:
                        words.append(dict(side=side, **word))
        probabilities = dict(out=activity_at(report,left_start,a), incoming=activity_at(report,b,right_end))
        discontinuity = None
        if sound:
            before = audio(source['path'],left_start,a,48000); after = audio(source['path'],b,right_end,48000)
            discontinuity = dict(sample_jump=abs(before[-1]-after[0]), rms_before_dbfs=rms(before), rms_after_dbfs=rms(after))
        flags = []
        if words:
            flags.append('word_intersection')
        if any(p is not None and p >= .5 for p in probabilities.values()):
            flags.append('speech_near_cut')
        if discontinuity and discontinuity['sample_jump'] >= jump_threshold:
            flags.append('sample_discontinuity')
        facts.append(dict(index=index, output_time=left['output_end'], out_clip_id=left['clip_id'],
                          in_clip_id=right['clip_id'], source_out=a, source_in=b,
                          words=words, speech_probability=probabilities, audio=discontinuity, review_flags=flags))
    # Partial words at the first/last retained edge matter even without an internal join.
    edges = []
    if report:
        for s in timeline['spans']:
            for side, at in [('start',s['source_start']),('end',s['source_end'])]:
                for w in report['words']:
                    if w['source_start'] is not None and w['source_start'] < at < w['source_end']:
                        edges.append(dict(clip_id=s['clip_id'], side=side, word_id=w['id'], text=w['text'], status=w['status']))
    return dict(cuts=facts, intersected_edges=edges,
                speech_evidence='available' if report else 'unavailable',
                unaligned_word_ids=[w['id'] for w in report['words'] if w['status']!='aligned'] if report else None,
                settings=dict(window_seconds=window, sample_jump_threshold=jump_threshold, speech_review_threshold=.5),
                limitations=['Source joins are measured before authored Fluvie fades, audio mixing or effects.',
                             'A sample jump or nearby speech is a review candidate, not proof of an audible defect.',
                             'Missing/uncertain word evidence is not a clean bill of health.'])


def main():
    p = argparse.ArgumentParser(description=__doc__)
    subs = p.add_subparsers(dest='command', required=True)
    m = subs.add_parser('media'); m.add_argument('--media', required=True)
    m.add_argument('--silence-db', type=float, default=-40); m.add_argument('--minimum', type=float, default=.2)
    m.add_argument('--black-pixel', type=float, default=.1); m.add_argument('--black-share', type=float, default=.98)
    c = subs.add_parser('cuts'); c.add_argument('--source', required=True); c.add_argument('--timeline', required=True)
    c.add_argument('--speech'); c.add_argument('--window', type=float, default=.04); c.add_argument('--jump-threshold', type=float, default=.2)
    c.add_argument('--excerpts', action='store_true', help='Create source diagnostics for flagged joins (maximum 50)')
    for sub in (m,c):
        sub.add_argument('--output', required=True)
    a = p.parse_args()
    with output_directory(a.output) as out:
        source = identity(a.media if a.command=='media' else a.source)
        if a.command=='media':
            report = dict(format='media-measurements', version=1, time_base='input', source=source,
                          measurements=measure(a.media,a.silence_db,a.minimum,a.black_pixel,a.black_share))
        else:
            timeline = timeline_document(a.timeline, source)
            speech = read(a.speech) if a.speech else None
            facts = cut_facts(source,timeline,speech,a.window,a.jump_threshold)
            report = dict(format='cut-evidence', version=1, time_base='output', source=source,
                          timeline_revision=timeline['revision'], timeline_sha256=digest(timeline),
                          speech_sha256=digest(speech) if speech else None, **facts)
            if a.excerpts:
                from .previews import build, select_ranges
                flagged = [c['index'] for c in facts['cuts'] if c['review_flags']]
                if flagged:
                    dest = out/'excerpts'; dest.mkdir()
                    build(source,timeline,select_ranges(timeline,cuts=flagged[:50]),dest)
                    report['excerpts'] = 'excerpts/previews.json'
                    report['excerpts_omitted'] = max(0,len(flagged)-50)
            if digest(timeline_document(a.timeline, source)) != digest(timeline):
                raise ValueError('Timeline changed during analysis')
        report.update(tools=versions(), human_review_required=True)
        verify_source(source); write(out/'report.json', report)
    print(str(Path(a.output).resolve()/'report.json'))


if __name__ == '__main__':
    entrypoint(main)
