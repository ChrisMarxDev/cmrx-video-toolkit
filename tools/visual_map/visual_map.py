#!/usr/bin/env python3
"""Standalone pixel-change evidence analyzer. No models, interpretation or edits."""
import argparse
from collections import deque
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import tempfile

VERSION = 1


def fingerprint(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def difference(current, other, width, height, cols, rows, threshold, roi=None):
    """Integer pixel evidence; grid cells are row-major, ROI is half-open pixels."""
    sums, counts, changed = [0] * (cols * rows), [0] * (cols * rows), [0] * (cols * rows)
    total = hits = region_sum = region_count = 0
    for i, (a, b) in enumerate(zip(current, other)):
        value = abs(a - b)
        y, x = divmod(i, width)
        cell = min(rows - 1, y * rows // height) * cols + min(cols - 1, x * cols // width)
        sums[cell] += value
        counts[cell] += 1
        changed[cell] += value > threshold
        total += value
        hits += value > threshold
        if roi and roi[0] <= x < roi[2] and roi[1] <= y < roi[3]:
            region_sum += value
            region_count += 1
    result = dict(mean=round(total / len(current), 6),
                  changed_fraction=round(hits / len(current), 6),
                  grid_mean=[round(s / n, 6) for s, n in zip(sums, counts)],
                  grid_changed_fraction=[round(s / n, 6) for s, n in zip(changed, counts)])
    if roi:
        result['region_mean'] = round(region_sum / region_count, 6)
        outside = len(current) - region_count
        result['outside_region_mean'] = round((total - region_sum) / outside, 6) if outside else None
    return result


def candidate_windows(samples, fps, end, threshold, minimum, padding, gap, use_roi):
    """Union temporal signals, then merge before duration filtering and padding."""
    intervals = []
    field = 'region_mean' if use_roi else 'mean'
    for sample in samples:
        reasons = [name for name in ('previous', 'lag', 'reference')
                   if sample[name] is not None and sample[name][field] >= threshold]
        if not reasons:
            continue
        # Previous-frame movement could have started anywhere since the preceding sample.
        a = max(samples[0]['source_time'], sample['source_time'] - 1 / fps)
        b = min(end, sample['source_time'] + 1 / fps)
        if intervals and a <= intervals[-1]['source_end'] + gap + 1e-9:
            intervals[-1]['source_end'] = b
            intervals[-1]['signals'].update(reasons)
        else:
            intervals.append(dict(source_start=a, source_end=b, signals=set(reasons)))
    result = []
    for item in intervals:
        if item['source_end'] - item['source_start'] + 1e-9 < minimum:
            continue
        item['signals'] = sorted(item['signals'])
        item['review_start'] = max(samples[0]['source_time'], item['source_start'] - padding)
        item['review_end'] = min(end, item['source_end'] + padding)
        item['status'] = 'review-required'
        result.append(item)
    # Context windows may overlap: explicitly combine them without pretending all
    # context is active movement. Keep the constituent evidence intervals.
    merged = []
    for item in result:
        if merged and item['review_start'] <= merged[-1]['review_end']:
            merged[-1]['review_end'] = max(merged[-1]['review_end'], item['review_end'])
            merged[-1]['evidence'].append(item)
        else:
            merged.append(dict(id=f'v{len(merged)+1:04d}', review_start=item['review_start'],
                               review_end=item['review_end'], evidence=[item]))
    return merged


def analyze(source, args):
    probe = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(source)], text=True))
    streams = [s for s in probe['streams'] if s['codec_type'] == 'video'
               and not s.get('disposition', {}).get('attached_pic')]
    if not streams:
        raise ValueError('No video stream found')
    stream = streams[0]
    origin = float(probe['format'].get('start_time', 0))
    duration = float(probe['format']['duration'])
    if not math.isfinite(duration) or duration <= 0 or not math.isfinite(origin):
        raise ValueError('Media needs finite positive duration and finite start time')
    # Keep media-origin offsets. fps rounds DOWN, so labels never imply exact
    # original-frame PTS. showinfo records the actual resampled output grid.
    filters = (f'fps=fps={args.fps}:round=down,scale={args.width}:{args.height}:flags=area,'
               f'format=gray,boxblur={args.blur}:1,showinfo')
    command = ['ffmpeg', '-hide_banner', '-nostdin', '-loglevel', 'info',
               '-threads', '1', '-filter_threads', '1', '-copyts', '-start_at_zero',
               '-i', str(source), '-map', f'0:{stream["index"]}', '-an', '-sn', '-dn',
               '-vf', filters, '-fps_mode', 'passthrough', '-pix_fmt', 'gray',
               '-f', 'rawvideo', 'pipe:1']
    lag_count = max(1, round(args.lag_seconds * args.fps))
    reference_index = round(args.reference_seconds * args.fps)
    history = deque(maxlen=lag_count)
    reference = previous = None
    samples = []
    size = args.width * args.height
    with tempfile.TemporaryFile() as log:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=log)
        try:
            while True:
                frame = process.stdout.read(size)
                if not frame:
                    break
                if len(frame) != size:
                    raise ValueError('Truncated raw frame from FFmpeg')
                index = len(samples)
                if index == reference_index:
                    reference = frame
                def measure(other):
                    return difference(frame, other, args.width, args.height,
                                      args.cols, args.rows, args.pixel_threshold, args.region) if other is not None else None
                samples.append(dict(sample_index=index,
                                    brightness=round(sum(frame) / size, 6),
                                    previous=measure(previous),
                                    lag=measure(history[0]) if len(history) == lag_count else None,
                                    reference=measure(reference)))
                history.append(frame)
                previous = frame
            code = process.wait()
        finally:
            process.stdout.close()
            if process.poll() is None:
                process.kill()
                process.wait()
        log.seek(0)
        diagnostics = log.read().decode('utf-8', errors='replace')
    if code:
        raise ValueError(f'FFmpeg failed: {diagnostics[-3000:]}')
    timestamps = [float(t) for t in re.findall(r'\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:([\d.eE+-]+)', diagnostics)]
    if not samples or len(timestamps) != len(samples):
        raise ValueError('No samples or FFmpeg timestamp/frame count mismatch')
    if reference is None:
        raise ValueError('Reference offset is beyond sampled video')
    if any(b <= a for a, b in zip(timestamps, timestamps[1:])):
        raise ValueError('Sample timestamps must be strictly increasing')
    for sample, timestamp in zip(samples, timestamps):
        sample['source_time'] = timestamp
    end = min(duration, timestamps[-1] + 1 / args.fps)
    if end <= timestamps[-1]:
        raise ValueError('Media duration does not contain sampled video timestamps')
    settings = {key: value for key, value in vars(args).items() if key not in ('source', 'output')}
    return dict(version=VERSION, time_base='source', timestamp_unit='seconds',
                source=dict(path=str(source), sha256=fingerprint(source), duration=duration,
                            media_start_time=origin, video_stream_index=stream['index']),
                timing=dict(precision='resampled-grid', nominal_step=1 / args.fps,
                            origin='container start time', analyzed_start=timestamps[0], analyzed_end=end,
                            reference_time=timestamps[reference_index], effective_lag_seconds=lag_count / args.fps),
                implementation=dict(python=sys.version.split()[0],
                                    ffmpeg=subprocess.check_output(['ffmpeg', '-version'], text=True).splitlines()[0],
                                    analyzer_sha256=fingerprint(Path(__file__))),
                settings=settings, samples=samples,
                candidates=candidate_windows(samples, args.fps, end, args.event_threshold,
                                             args.min_event, args.padding, args.merge_gap, bool(args.region)),
                limitations=['Pixel changes are not gaze, pose, speech or editorial judgments.',
                             'Lighting, camera motion and background changes can trigger candidates.',
                             'Sparse sampling can miss brief events; timestamps are not original frame alignment.',
                             'Reference comparisons are unavailable before the selected reference sample.',
                             'No cuts, transcript integration or automatic pipeline invocation.'])


def timeline_svg(result):
    samples = result['samples']
    start, end = result['timing']['analyzed_start'], result['timing']['analyzed_end']
    field = 'region_mean' if result['settings']['region'] else 'mean'
    def x(t):
        return 50 + (t - start) / (end - start) * 1100
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 350">',
             '<rect width="1200" height="350" fill="white"/>',
             '<text x="50" y="25">Visual evidence: mean grayscale difference (0–255); shaded = review windows</text>']
    for item in result['candidates']:
        parts.append(f'<rect x="{x(item["review_start"]):.2f}" y="40" width="{x(item["review_end"])-x(item["review_start"]):.2f}" height="255" fill="#eee"/>')
    for name, color in [('previous', '#1764ab'), ('lag', '#c55a11'), ('reference', '#7030a0')]:
        points = ' '.join(f'{x(s["source_time"]):.2f},{295-s[name][field]:.2f}' for s in samples if s[name] is not None)
        parts.append(f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="1"/>')
    parts.append(f'<text x="50" y="320">{start:.3f}–{end:.3f} source seconds · blue: previous · orange: lag · purple: reference</text></svg>')
    return '\n'.join(parts) + '\n'


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path)
    p.add_argument('--output', type=Path, required=True, help='New directory; existing paths are refused')
    p.add_argument('--fps', type=float, default=4)
    p.add_argument('--width', type=int, default=320)
    p.add_argument('--height', type=int, default=180)
    p.add_argument('--cols', type=int, default=16)
    p.add_argument('--rows', type=int, default=9)
    p.add_argument('--blur', type=int, default=1)
    p.add_argument('--pixel-threshold', type=int, default=12)
    p.add_argument('--lag-seconds', type=float, default=2)
    p.add_argument('--reference-seconds', type=float, default=0,
                   help='Offset from first sampled frame; earlier reference comparisons are null')
    p.add_argument('--region', type=int, nargs=4, metavar=('X0', 'Y0', 'X1', 'Y1'),
                   help='Optional half-open rectangle in resized, displayed image pixels')
    p.add_argument('--event-threshold', type=float, default=8)
    p.add_argument('--min-event', type=float, default=.5)
    p.add_argument('--merge-gap', type=float, default=.5)
    p.add_argument('--padding', type=float, default=2)
    return p


def validate(args):
    for key in ('fps', 'lag_seconds', 'reference_seconds', 'event_threshold', 'min_event', 'merge_gap', 'padding'):
        if not math.isfinite(getattr(args, key)):
            raise ValueError(f'{key} must be finite')
    if not 0 < args.fps <= 60 or not 0 < args.lag_seconds <= 60:
        raise ValueError('fps and lag-seconds must be in (0, 60]')
    if not (2 <= args.width <= 1920 and 2 <= args.height <= 1080 and
            1 <= args.cols <= args.width and 1 <= args.rows <= args.height):
        raise ValueError('Invalid image/grid dimensions')
    if not 0 <= args.blur <= min(args.width, args.height) // 2 or not 0 <= args.pixel_threshold <= 255:
        raise ValueError('Invalid blur radius or pixel threshold')
    if not 0 < args.event_threshold <= 255 or args.min_event <= 0 or min(args.reference_seconds, args.merge_gap, args.padding) < 0:
        raise ValueError('Invalid event/reference parameters')
    if args.region:
        x0, y0, x1, y1 = args.region
        if not (0 <= x0 < x1 <= args.width and 0 <= y0 < y1 <= args.height):
            raise ValueError('Region must be a nonempty rectangle inside the resized image')


def main():
    args = parser().parse_args()
    validate(args)
    source = args.source.expanduser().resolve(strict=True)
    output = args.output.expanduser().resolve()
    if output.exists():
        raise ValueError('Output already exists; choose a new directory')
    result = analyze(source, args)
    output.mkdir(parents=True, exist_ok=False)
    (output / 'visual-map.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    (output / 'timeline.svg').write_text(timeline_svg(result))
    print(json.dumps(dict(output=str(output), samples=len(result['samples']), candidates=len(result['candidates']))))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as exc:
        sys.exit(f'Error: {exc}')
