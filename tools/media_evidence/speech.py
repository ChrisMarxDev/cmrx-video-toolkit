"""Optional local forced alignment and VAD. Emits evidence, never cut decisions."""
import argparse
from pathlib import Path
import re
from .common import (audio, entrypoint, finite, identity, interval, output_directory,
                     read, sha, verify_source, versions, write)
from .ctc import align


def segments(data, duration):
    t = data.get('transcript', data)
    if t.get('time_base') != 'source':
        raise ValueError('Transcript must declare time_base: source')
    result, previous = [], 0.
    for i, s in enumerate(t.get('segments', [])):
        a, b = s['source_start'], s['source_end']; interval(a, b, duration)
        if a < previous or b-a > 30:
            raise ValueError('Alignment requires ordered nonoverlapping source segments of at most 30 seconds')
        if not isinstance(s.get('text'), str):
            raise ValueError('Transcript text must be a string')
        result.append(dict(id=s.get('id', f's{i:06d}'), start=a, end=b, text=s['text']))
        previous = b
    if not result:
        raise ValueError('Transcript needs source-timed segments')
    return result


def speech_intervals(frames, threshold=.5):
    result = []
    for f in frames:
        if f['probability'] >= threshold:
            if result and abs(result[-1]['source_end']-f['source_start']) < 1e-6:
                result[-1]['source_end'] = f['source_end']
            else:
                result.append(dict(source_start=f['source_start'], source_end=f['source_end']))
    return result


class OnnxSpeech:
    def __init__(self, directory):
        try:
            import numpy as np
            import onnxruntime as ort
        except ImportError as e:
            raise ValueError('Speech inference needs the optional requirements.txt environment') from e
        self.np = np
        self.specs = read(Path(__file__).with_name('models.json'))
        for name, spec in self.specs.items():
            file = Path(directory) / name
            if not file.is_file() or sha(file) != spec['sha256']:
                raise ValueError(f'Missing/incorrect model {name}; run setup_models explicitly')
        options = ort.SessionOptions(); options.intra_op_num_threads = 2; options.inter_op_num_threads = 1
        self.ctc = ort.InferenceSession(str(Path(directory)/'alignment.onnx'), options, providers=['CPUExecutionProvider'])
        self.vad = ort.InferenceSession(str(Path(directory)/'vad.onnx'), options, providers=['CPUExecutionProvider'])
        self.vocab = read(Path(directory)/'vocab.json')
        self.runtime = dict(numpy=np.__version__, onnxruntime=ort.__version__, provider='CPUExecutionProvider')

    def emissions(self, samples):
        np = self.np
        values = np.asarray(samples, dtype=np.float32)
        values = (values-values.mean()) / np.sqrt(values.var()+1e-7)
        feed = {'input_values': values[None, :]}
        if any(x.name == 'attention_mask' for x in self.ctc.get_inputs()):
            feed['attention_mask'] = np.ones((1, len(values)), dtype=np.int64)
        return self.ctc.run(None, feed)[0][0]

    def activity(self, source, duration):
        np = self.np
        state = np.zeros((2, 1, 128), dtype=np.float32)
        context = np.zeros((1, 64), dtype=np.float32)
        frames, offset = [], 0
        # Chunks are multiples of the model window so decoder chunking does not
        # introduce artificial silence/context resets. A final window is padded.
        chunk_seconds = 512*900/16000
        while offset/16000 < duration-1/16000:
            end = min(duration, offset/16000+chunk_seconds)
            samples = np.asarray(audio(source, offset/16000, end, allow_empty=True), dtype=np.float32)
            if not len(samples):
                break
            for j in range(0, len(samples), 512):
                part = samples[j:j+512]
                window = np.pad(part, (0, 512-len(part)))[None, :]
                values = np.concatenate([context, window], axis=1)
                probability, state = self.vad.run(None, dict(input=values, state=state, sr=np.array(16000, dtype=np.int64)))
                context = window[:, -64:]
                frames.append(dict(source_start=(offset+j)/16000,
                                   source_end=min(duration, (offset+j+len(part))/16000),
                                   probability=float(probability.reshape(-1)[0])))
            offset += len(samples)
            if len(samples) < round((end-(offset-len(samples))/16000)*16000)-2:
                break
        return frames


def align_segment(segment, samples, backend, threshold):
    words = segment['text'].split()
    normalized = [re.sub(r"[^A-Z'0-9À-ÿ]", '', w.upper()) for w in words]
    # Never invent timestamps for unsupported tokens/numbers or punctuation-only words.
    supported = all(w and all(c in backend.vocab for c in w) for w in normalized)
    result = [dict(text=w, segment_id=segment['id'], source_start=None, source_end=None,
                   confidence=None, status='unaligned') for w in words]
    if not words:
        return result
    if not supported:
        for word in result:
            word['status'] = 'unsupported_text'
        return result
    tokens, owners = [], []
    for i, word in enumerate(normalized):
        if i:
            tokens.append(backend.vocab['|']); owners.append(None)
        for char in word:
            tokens.append(backend.vocab[char]); owners.append(i)
    if len(tokens) > 1500:
        raise ValueError('Too much text in one alignment segment (maximum 1500 tokens)')
    if len(samples) < 400:
        return result
    paths = align(backend.emissions(samples), tokens, backend.vocab['<pad>'])
    if paths is None:
        return result
    for i, word in enumerate(result):
        parts = [p for p, owner in zip(paths, owners) if owner == i]
        a = segment['start'] + min(p['start'] for p in parts)*.02
        b = min(segment['end'], segment['start']+max(p['end'] for p in parts)*.02)
        confidence = sum(p['score'] for p in parts)/len(parts)
        if a < b:
            word.update(source_start=a, source_end=b, confidence=confidence,
                        status='aligned' if confidence >= threshold else 'low_confidence')
    return result


def analyze(source, transcript, backend, threshold=.15, vad_threshold=.5):
    transcript_hash = sha(transcript)
    document = read(transcript)
    if document.get('format') == 'video-review' and document['source']['sha256'] != source['sha256']:
        raise ValueError('Review transcript belongs to different source bytes')
    if document.get('source', {}).get('sha256') not in (None, source['sha256']):
        raise ValueError('Transcript source fingerprint mismatch')
    cues = segments(document, source['duration'])
    activity = backend.activity(source['path'], source['duration'])
    words = []
    for cue in cues:
        found = align_segment(cue, audio(source['path'], cue['start'], cue['end']), backend, threshold)
        for word in found:
            word['id'] = f'w{len(words):06d}'
            if word['source_start'] is not None:
                voiced = any(f['probability'] >= vad_threshold and f['source_start'] < word['source_end']
                             and f['source_end'] > word['source_start'] for f in activity)
                if not voiced:
                    word['status'] = 'no_speech_support'
            words.append(word)
    return dict(format='speech-evidence', version=1, time_base='source', source=source,
                transcript=dict(path=str(Path(transcript).resolve()), sha256=transcript_hash),
                language='en', words=words, speech= speech_intervals(activity, vad_threshold),
                activity=activity, models=backend.specs, runtime=backend.runtime,
                settings=dict(confidence_threshold=threshold, vad_threshold=vad_threshold,
                              sample_rate=16000, alignment_frame_seconds=.02, vad_window_samples=512),
                limitations=['English alignment only; segment bounds constrain the search.',
                             'Confidence is a model score, not a calibrated probability of correct timing.',
                             'Forced alignment can fit incorrect text. Listen and review before editing.',
                             'VAD is probabilistic; quiet speech and music can be misclassified.'])


def validate_evidence(report, source):
    if report.get('format') != 'speech-evidence' or report.get('version') != 1 or report.get('time_base') != 'source':
        raise ValueError('Expected source-timed speech-evidence version 1')
    if report['source']['sha256'] != source['sha256']:
        raise ValueError('Speech evidence belongs to different source bytes')
    previous, ids = 0., set()
    for word in report['words']:
        if word['id'] in ids or word.get('status') not in ('aligned', 'low_confidence', 'unaligned', 'unsupported_text', 'no_speech_support'):
            raise ValueError('Invalid speech word identity/status')
        ids.add(word['id'])
        a, b = word['source_start'], word['source_end']
        if a is None and b is None and word['status'] in ('unaligned', 'unsupported_text'):
            continue
        interval(a, b, source['duration'])
        if a < previous-1e-6 or not finite(word.get('confidence')) or not 0 <= word['confidence'] <= 1:
            raise ValueError('Invalid aligned word timing/confidence')
        previous = b
    previous = 0.
    for f in report['activity']:
        interval(f['source_start'], f['source_end'], source['duration'])
        if f['source_start'] < previous-1e-6 or not finite(f['probability']) or not 0 <= f['probability'] <= 1:
            raise ValueError('Invalid speech activity')
        previous = f['source_end']
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', required=True); p.add_argument('--transcript', required=True)
    p.add_argument('--models', required=True); p.add_argument('--output', required=True)
    p.add_argument('--language', choices=['en'], required=True)
    p.add_argument('--confidence-threshold', type=float, default=.15)
    p.add_argument('--vad-threshold', type=float, default=.5)
    a = p.parse_args()
    if not all(finite(x) and 0 < x < 1 for x in (a.confidence_threshold, a.vad_threshold)):
        raise ValueError('Thresholds must be between zero and one')
    with output_directory(a.output) as out:
        source = identity(a.source)
        report = analyze(source, a.transcript, OnnxSpeech(a.models), a.confidence_threshold, a.vad_threshold)
        report['tools'] = versions()
        validate_evidence(report, source); verify_source(source)
        if sha(a.transcript) != report['transcript']['sha256']:
            raise ValueError('Transcript changed during analysis')
        write(out/'speech.json', report)
    print(str(Path(a.output).resolve()/'speech.json'))


if __name__ == '__main__':
    entrypoint(main)
