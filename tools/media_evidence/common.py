"""Small standard-library contracts shared by the independent evidence commands."""
import array
from contextlib import contextmanager
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def run(args):
    return subprocess.run([str(x) for x in args], check=True, capture_output=True)


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def digest(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, allow_nan=False).encode()).hexdigest()


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def interval(a, b, duration):
    if not all(finite(x) for x in (a, b, duration)) or not 0 <= a < b <= duration + 1e-6:
        raise ValueError(f'Invalid interval {a}..{b} within {duration}')


def probe(path):
    return json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', path]).stdout)


def identity(path):
    path = Path(path).resolve()
    info = probe(path)
    duration = float(info['format']['duration'])
    if not finite(duration) or duration <= 0:
        raise ValueError('Media must have a finite positive duration')
    return dict(path=str(path), sha256=sha(path), duration=duration)


def versions():
    return dict(python=sys.version.split()[0], ffmpeg=run(['ffmpeg', '-version']).stdout.decode().splitlines()[0],
                implementation=digest({p.name: sha(p) for p in sorted(Path(__file__).parent.glob('*.py'))}))


def audio(path, start, end, rate=16000, allow_empty=False):
    """Decode a bounded interval, mono float PCM. Callers choose memory bounds."""
    data = run(['ffmpeg', '-v', 'error', '-i', path, '-ss', str(start), '-t', str(end-start),
                '-map', '0:a:0', '-ac', '1', '-ar', str(rate), '-f', 'f32le', '-']).stdout
    values = array.array('f'); values.frombytes(data)
    if sys.byteorder != 'little':
        values.byteswap()
    if (not values and not allow_empty) or not all(math.isfinite(v) for v in values):
        raise ValueError('Decoded audio is empty or non-finite')
    return values


@contextmanager
def output_directory(path):
    """Never overwrite existing evidence; only publish a completely successful run."""
    target = Path(path).resolve()
    if target.exists():
        raise ValueError(f'Output must be a new directory: {target}')
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.evidence-', dir=target.parent))
    try:
        yield staging
        # mkdir is exclusive even if another process claimed the requested path.
        target.mkdir()
        try:
            for child in staging.iterdir():
                child.rename(target / child.name)
        except BaseException:
            shutil.rmtree(target)
            raise
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def timeline_document(path, source):
    t = read(path)
    if t.get('version') != 1 or not isinstance(t.get('revision'), str) or not t['revision']:
        raise ValueError('Expected toolkit timeline version 1 and revision')
    if not finite(t.get('source_duration')) or abs(t['source_duration']-source['duration']) > .05:
        raise ValueError('Timeline source duration differs from media')
    spans = t.get('spans')
    if not isinstance(spans, list) or not spans:
        raise ValueError('Timeline needs spans')
    cursor, previous, ids = 0., 0., set()
    for s in spans:
        interval(s['source_start'], s['source_end'], source['duration'])
        interval(s['output_start'], s['output_end'], t['duration'])
        if s['source_start'] < previous-1e-6 or abs(s['output_start']-cursor) > 1e-6:
            raise ValueError('Timeline spans must be ordered, contiguous in output, nonoverlapping in source')
        if abs((s['source_end']-s['source_start'])-(s['output_end']-s['output_start'])) > 1e-6:
            raise ValueError('Retimed spans are not supported by this source/output contract')
        if not isinstance(s.get('clip_id'), str) or not s['clip_id'] or s['clip_id'] in ids:
            raise ValueError('Timeline needs unique clip IDs')
        ids.add(s['clip_id']); cursor = s['output_end']; previous = s['source_end']
    if abs(cursor-t['duration']) > 1e-6:
        raise ValueError('Timeline duration differs from spans')
    # Pipeline project supplies identity; generic callers must provide the correct map.
    project = Path(path).resolve().parent.parent / 'project.json'
    if project.is_file():
        configured = Path(read(project)['source']).resolve()
        if sha(configured) != source['sha256']:
            raise ValueError('Timeline project source differs from supplied source')
    return t


def verify_source(source):
    if sha(source['path']) != source['sha256']:
        raise ValueError('Source changed during analysis')


def entrypoint(fn):
    try:
        fn()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as e:
        detail = e.stderr.decode(errors='replace')[-2000:] if isinstance(e, subprocess.CalledProcessError) and e.stderr else str(e)
        print(json.dumps(dict(error=detail)), file=sys.stderr)
        raise SystemExit(2)
