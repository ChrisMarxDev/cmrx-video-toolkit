"""Resolve local Whisper models and provision a verified multilingual default."""
import hashlib
import json
import os
from pathlib import Path
import threading
import urllib.request
import uuid

BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
BASE_SHA256 = '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'
BASE_SIZE = 147951465
_lock = threading.Lock()


def cache_dir():
    return Path(os.environ.get('XDG_CACHE_HOME', Path.home() / '.cache')) / 'cmrx-video-toolkit' / 'models'


def resolve_model(explicit=None, progress=lambda message: None, cancel=None):
    def check_cancel():
        if cancel and cancel.is_set():
            raise ValueError('Cancelled')
    explicit = explicit or os.environ.get('WHISPER_MODEL')
    if explicit:
        path = Path(explicit).expanduser()
        if path.is_file() and path.stat().st_size:
            return path
        raise ValueError('The selected transcription model is unavailable. Clear the optional model override to use automatic setup.')
    candidates = []
    try:
        saved = json.loads((Path.home() / 'VideoReviews/settings.json').read_text()).get('model')
        if saved:
            candidates.append(Path(saved).expanduser())
    except (OSError, ValueError, TypeError):
        pass
    candidates += [cache_dir() / 'ggml-base.bin',
                   Path.home() / '.local/share/whisper.cpp/models/ggml-base.bin',
                   Path.home() / 'Library/Application Support/flut_script/models/ggml-base.bin']
    with _lock:
        check_cancel()
        for candidate in candidates:
            if candidate.is_file() and candidate.stat().st_size:
                return candidate
        target = cache_dir() / 'ggml-base.bin'
        target.parent.mkdir(parents=True, exist_ok=True)
        pending = target.with_suffix('.' + uuid.uuid4().hex + '.part')
        try:
            progress('Downloading transcription model (148 MB, once per machine)…')
            digest = hashlib.sha256()
            size = 0
            with urllib.request.urlopen(BASE_URL, timeout=30) as response, pending.open('wb') as output:
                while True:
                    check_cancel()
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > BASE_SIZE:
                        raise ValueError('Transcription model download exceeded its expected size')
                    output.write(chunk)
                    digest.update(chunk)
                    progress(f'Downloading transcription model… {size * 100 // BASE_SIZE}%')
            check_cancel()
            if size != BASE_SIZE or digest.hexdigest() != BASE_SHA256:
                raise ValueError('Transcription model download failed verification. Retry to download it again.')
            pending.replace(target)
            return target
        except OSError as exc:
            raise ValueError('Could not download the transcription model. Check your connection and Retry; your recording is preserved.') from exc
        finally:
            pending.unlink(missing_ok=True)
