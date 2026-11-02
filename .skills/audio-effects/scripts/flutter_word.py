#!/usr/bin/env python3
"""Blend deterministic pitch flutter into one measured PCM16 WAV word window."""
import argparse
import array
import json
import math
from pathlib import Path
import sys
import wave


def process(samples, channels, sample_rate, start, end, rate, depth_ms, mix):
    values = (start, end, rate, depth_ms, mix)
    if not all(math.isfinite(v) for v in values):
        raise ValueError('Parameters must be finite')
    frames = len(samples) // channels
    if not (0 <= start < end <= frames / sample_rate):
        raise ValueError('Word window must be inside the audio')
    if not (0 < rate <= 100 and 0 <= depth_ms <= 10 and 0 <= mix <= 1):
        raise ValueError('Require 0 < rate <= 100 Hz, 0 <= depth <= 10 ms, 0 <= mix <= 1')
    first, stop = round(start * sample_rate), round(end * sample_rate)
    count = stop - first
    if count < 2:
        raise ValueError('Word window must contain at least two frames')
    result = array.array('h', samples)
    wet = []
    dry_energy = 0.0
    for i in range(count):
        position = i + sample_rate * depth_ms / 1000 * math.sin(2 * math.pi * rate * i / sample_rate)
        position = max(0, min(count - 2, position))
        j = int(position)
        fraction = position - j
        envelope = max(0, min(1, i / (sample_rate * .018), (count - 1 - i) / (sample_rate * .025)))
        for c in range(channels):
            dry = samples[(first + i) * channels + c]
            a = samples[(first + j) * channels + c]
            b = samples[(first + j + 1) * channels + c]
            changed = (1 - mix) * dry + mix * (a * (1 - fraction) + b * fraction)
            wet.append(dry + (changed - dry) * envelope)
            dry_energy += dry * dry
    energy = sum(v * v for v in wet)
    gain = math.sqrt(dry_energy / energy) if energy else 1.0
    if any(abs(v * gain) > 32767 for v in wet):
        raise ValueError('RMS matching would clip; reduce mix or lower source gain before processing')
    result[first * channels:stop * channels] = array.array('h', (round(v * gain) for v in wet))
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    for key in ('start', 'end', 'rate', 'depth-ms', 'mix'):
        p.add_argument('--' + key, type=float, required=True)
    a = p.parse_args()
    try:
        with wave.open(str(a.input), 'rb') as f:
            params = f.getparams()
            if params.sampwidth != 2 or params.comptype != 'NONE' or params.nchannels not in (1, 2):
                raise ValueError('Input must be uncompressed mono/stereo PCM16 WAV')
            samples = array.array('h', f.readframes(params.nframes))
        if sys.byteorder != 'little':
            samples.byteswap()
        processed = process(samples, params.nchannels, params.framerate, a.start, a.end, a.rate, a.depth_ms, a.mix)
        if sys.byteorder != 'little':
            processed.byteswap()
        # Exclusive creation protects originals and prior results, including aliases.
        with a.output.open('xb') as target:
            with wave.open(target, 'wb') as f:
                f.setparams(params)
                f.writeframes(processed.tobytes())
        print(json.dumps({'input': str(a.input.resolve()), 'output': str(a.output.resolve()),
                          'time_base': 'input-file', 'start': a.start, 'end': a.end,
                          'rate_hz': a.rate, 'depth_ms': a.depth_ms, 'mix': a.mix,
                          'sample_rate': params.framerate, 'frames': params.nframes,
                          'fade_in_ms': 18, 'fade_out_ms': 25}))
    except (OSError, ValueError, wave.Error) as error:
        p.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
