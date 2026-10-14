#!/usr/bin/env python3
"""Analyze original audio and source-timed transcripts; never apply cuts."""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import wave

FILLERS = {'äh', 'ähm', 'öh', 'öhm', 'uh', 'uhm', 'um', 'erm', 'hmm', 'mhm'}


def read(path):
    return json.loads(Path(path).read_text())


def fingerprint(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def valid_interval(a, b, duration):
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (a, b)) or not 0 <= a < b <= duration + .15:
        raise ValueError(f'Invalid source interval: {a}..{b}')


def normalize_transcript(data, duration, time_base=None):
    """Keep segment precision; output-only text must not masquerade as source time."""
    words = data.get('words', [])
    granularity = 'word' if words else 'segment'
    entries = words or data.get('segments', [])
    result = []
    previous = -1
    for i, entry in enumerate(entries):
        if 'source_start' in entry and 'source_end' in entry:
            a, b = entry['source_start'], entry['source_end']
        elif 'start' in entry and 'end' in entry and (time_base == 'source' or 'videoPath' in data):
            a, b = entry['start'], entry['end']
        else:
            raise ValueError('Transcript needs source_start/source_end or explicit --transcript-time-base source. Output-only cues are not accepted.')
        valid_interval(a, b, duration)
        if a < previous:
            raise ValueError('Transcript entries must be in source order')
        previous = a
        result.append(dict(id=entry.get('id', f'{granularity[0]}{i:06d}'), source_start=a,
                           source_end=b, text=entry.get('text', entry.get('word', '')), granularity=granularity))
    return result, granularity


def levels_from_wav(path, frame_ms=20):
    with wave.open(str(path), 'rb') as f:
        if f.getnchannels() != 1 or f.getsampwidth() != 2:
            raise ValueError('Expected mono signed 16-bit PCM')
        rate = f.getframerate()
        n = max(1, round(rate * frame_ms / 1000))
        levels = []
        cursor = 0
        while raw := f.readframes(n):
            samples = array.array('h', raw)
            if sys.byteorder != 'little':
                samples.byteswap()
            rms = math.sqrt(sum(v * v for v in samples) / len(samples)) / 32768
            levels.append(dict(source_start=cursor / rate, source_end=(cursor + len(samples)) / rate,
                               rms_dbfs=round(20 * math.log10(max(rms, 1e-6)), 2)))
            cursor += len(samples)
    return levels, cursor / rate


def decode_source(source, wav):
    info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(source)], text=True))
    duration = float(info['format']['duration'])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Source duration must be finite and positive')
    # Preserve delayed audio and timestamp gaps relative to the media origin.
    subprocess.run(['ffmpeg','-v','error','-nostdin','-copyts','-start_at_zero','-i',str(source),
                    '-map','0:a:0','-af','aresample=16000:async=1:first_pts=0',
                    '-ac','1','-c:a','pcm_s16le',str(wav)], check=True)
    return duration


def waveform_svg(levels, items, duration):
    width, height = 1200, 220
    step = max(1, math.ceil(len(levels)/width))
    points = []
    for i in range(0, len(levels), step):
        db = max(x['rms_dbfs'] for x in levels[i:i+step])
        points.append(f"{levels[i]['source_start']/duration*width:.2f},{180-max(0,min(1,(db+60)/60))*150:.2f}")
    rects = ''.join(f'<rect x="{c["source_start"]/duration*width:.2f}" y="20" width="{(c["source_end"]-c["source_start"])/duration*width:.2f}" height="160" fill="#ffcc77" opacity="0.22"/>' for c in items if c['kind']=='quiet')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}"><rect width="1200" height="220" fill="#101820"/>{rects}<polyline points="{" ".join(points)}" fill="none" stroke="#81e6c3" stroke-width="1"/><text x="12" y="205" fill="white" font-size="14">Source time: 0 to {duration:.2f}s | RMS envelope (-60 to 0 dBFS) | amber: quiet candidates, not verified silence</text></svg>'


def quiet_intervals(levels, threshold, minimum):
    intervals = []
    start = end = None
    for item in levels:
        if item['rms_dbfs'] <= threshold:
            if start is None:
                start = item['source_start']
            end = item['source_end']
        else:
            if start is not None and end - start >= minimum - 1e-9:
                intervals.append((start, end))
            start = end = None
    if start is not None and end - start >= minimum - 1e-9:
        intervals.append((start, end))
    return intervals


def output_windows(a, b, timeline):
    if timeline is None:
        return None
    result = []
    for span in timeline['spans']:
        x, y = max(a, span['source_start']), min(b, span['source_end'])
        if x < y:
            result.append(dict(start=span['output_start'] + x - span['source_start'],
                               end=span['output_start'] + y - span['source_start']))
    return result


def candidates(levels, transcript, threshold=-35, minimum=.35, padding=.08, timeline=None):
    found = []
    def add(kind, a, b, evidence, precision, **extra):
        context = [x for x in transcript if x['source_end'] >= a - 1 and x['source_start'] <= b + 1]
        windows = output_windows(a, b, timeline)
        found.append(dict(id=f'c{len(found)+1:04d}', kind=kind, source_start=a, source_end=b,
                          duration=round(b-a, 4), precision=precision, evidence=evidence,
                          transcript_context=context, output_windows=windows,
                          status='removed-by-edit' if windows == [] else 'review-required', **extra))
    for a, b in quiet_intervals(levels, threshold, minimum):
        add('quiet', a, b, f'RMS <= {threshold} dBFS; may include breath or quiet speech.', 'audio-frame',
            possible_trim=dict(source_start=a+padding, source_end=b-padding) if b-a > 2*padding else None,
            caution='Boundary padding is a review aid, not verified speech protection.')
    previous = None
    for entry in transcript:
        tokens = re.findall(r"[^\W\d_]+", entry['text'].casefold())
        filler = sorted(set(tokens) & FILLERS)
        if filler:
            add('possible-filler', entry['source_start'], entry['source_end'], ', '.join(filler), entry['granularity'],
                caution='May be meaningful speech. Segment bounds do not locate the filler within the segment.')
        repeated = any(a == b for a, b in zip(tokens, tokens[1:]))
        if previous and tokens and tokens == previous[1] and entry['source_start'] - previous[0]['source_end'] <= 1:
            repeated = True
        if repeated:
            add('possible-repetition', entry['source_start'], entry['source_end'], entry['text'], entry['granularity'],
                caution='Repeated text may be intentional emphasis; no automatic deletion.')
        previous = (entry, tokens)
    return sorted(found, key=lambda c: (c['source_start'], c['kind']))


def validate_timeline(t, duration):
    if abs(t['source_duration']-duration) > .15:
        raise ValueError('Timeline source duration differs from original audio')
    cursor = 0
    source_end = 0
    for s in t['spans']:
        valid_interval(s['source_start'], s['source_end'], duration)
        valid_interval(s['output_start'], s['output_end'], t['duration'])
        if s['source_start'] < source_end or abs(s['output_start']-cursor) > 1e-6 or abs((s['source_end']-s['source_start'])-(s['output_end']-s['output_start'])) > 1e-6:
            raise ValueError('Invalid timeline mapping')
        source_end, cursor = s['source_end'], s['output_end']
    if abs(cursor-t['duration']) > 1e-6:
        raise ValueError('Timeline duration does not match spans')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('project', type=Path)
    p.add_argument('--transcript', type=Path)
    p.add_argument('--transcript-time-base', choices=['source'])
    p.add_argument('--threshold-db', type=float, default=-35)
    p.add_argument('--min-pause', type=float, default=.35)
    p.add_argument('--padding', type=float, default=.08)
    args = p.parse_args()
    if not all(math.isfinite(x) for x in (args.threshold_db, args.min_pause, args.padding)) or not -120 <= args.threshold_db <= 0 or args.min_pause <= 0 or args.padding < 0:
        p.error('Use a finite threshold in [-120, 0], positive min-pause, and nonnegative padding')
    project = args.project.resolve()
    config = read(project/'project.json')
    source = Path(config['source']).resolve()
    # Analyze the original directly: never trust a potentially stale extracted WAV.
    with tempfile.TemporaryDirectory(prefix='video_soundmap_') as temp:
        wav = Path(temp)/'audio.wav'
        duration = decode_source(source, wav)
        levels, audio_coverage = levels_from_wav(wav)
    transcript_path = args.transcript
    if transcript_path is None:
        transcript_path = next((project/x for x in ['transcript/segments.json','edit/decisions.json'] if (project/x).exists()), None)
    transcript, granularity = [], 'none'
    if transcript_path:
        data = read(transcript_path)
        if 'videoPath' in data and Path(data['videoPath']).expanduser().resolve() != source:
            raise ValueError('Transcript references a different recording')
        transcript, granularity = normalize_transcript(data, duration, args.transcript_time_base)
    timeline_path = project/'edit/timeline.json'
    timeline = read(timeline_path) if timeline_path.exists() else None
    if timeline:
        validate_timeline(timeline, duration)
    items = candidates(levels, transcript, args.threshold_db, args.min_pause, args.padding, timeline)
    result = dict(version=1, time_base='source', timestamp_unit='seconds', source=str(source),
                  source_sha256=fingerprint(source), source_duration=duration, analyzed_audio_end=audio_coverage,
                  transcript_path=str(transcript_path.resolve()) if transcript_path else None,
                  transcript_sha256=fingerprint(transcript_path) if transcript_path else None,
                  timeline_revision=timeline.get('revision') if timeline else None,
                  timeline_sha256=fingerprint(timeline_path) if timeline else None,
                  transcript_granularity=granularity, transcript=transcript,
                  settings=dict(frame_ms=20, threshold_db=args.threshold_db, min_pause=args.min_pause, padding=args.padding),
                  limitations=['Energy detection is not speech VAD or word alignment.', 'Filler detection is lexical; ASR may omit fillers.', 'No cuts applied. Candidates may overlap; do not sum durations as savings.'],
                  levels=levels, candidates=items)
    out = project/'analysis'; out.mkdir(exist_ok=True)
    (out/'waveform.svg').write_text(waveform_svg(levels, items, duration))
    (out/'soundmap.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    lines = ['# Sound map review', '', f'Original source: {source.name}', f'Transcript precision: {granularity}',
             '', 'All ranges below are ORIGINAL SOURCE seconds. Output windows refer to the current edit.',
             'Quiet means low audio energy, not confirmed silence. No cuts have been applied.',
             'Re-run after source, transcript, or timeline changes. Never cut an entire segment just because it contains a filler.', '',
             '[Audio envelope and quiet intervals](waveform.svg)', '', '| ID | Candidate | Source seconds | Current output windows | Evidence | Transcript context |', '|---|---|---|---|---|---|']
    for c in items:
        windows = c['output_windows']
        output = 'not mapped' if windows is None else ', '.join(f"{w['start']:.2f}–{w['end']:.2f}" for w in windows) or 'removed by edit'
        evidence = c['evidence'].replace('|', '\\|').replace('\n',' ')
        context = ' / '.join(x['text'] for x in c['transcript_context']).replace('|', '\\|').replace('\n', ' ')
        lines.append(f"| {c['id']} | {c['kind']} ({c['precision']}) | {c['source_start']:.2f}–{c['source_end']:.2f} | {output} | {evidence} | {context} |")
    (out/'soundmap.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps(dict(report=str(out/'soundmap.md'), source_duration=duration, transcript_granularity=granularity,
                          candidates=len(items), retained_candidates=sum(x['status']!='removed-by-edit' for x in items)), indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as exc:
        sys.exit(f'Error: {exc}')
