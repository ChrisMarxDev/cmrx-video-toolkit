#!/usr/bin/env python3
"""Run the single-video review app locally on Windows, macOS or Linux."""
import argparse
import copy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import secrets
import threading
import urllib.parse
import uuid

import review

WEB = Path(__file__).parent / 'web'


class Session:
    def __init__(self, home, model=None):
        self.home = Path(home).expanduser().resolve()
        self.home.mkdir(parents=True, exist_ok=True)
        self.default_model = model or os.environ.get('WHISPER_MODEL')
        settings = self.home / 'settings.json'
        if not self.default_model and settings.exists():
            try:
                self.default_model = review.read(settings).get('model')
            except (ValueError, OSError):
                pass
        self.lock = threading.RLock()
        self.cancel = threading.Event()
        self.workspace = None
        self.document = None
        self.last_open = None
        self.worker = None
        self.job = dict(busy=False, message='Open a video to begin', error=None, export=None)

    def snapshot(self):
        with self.lock:
            return dict(document=copy.deepcopy(self.document), workspace=str(self.workspace) if self.workspace else None, job=dict(self.job), last_open=copy.deepcopy(self.last_open))

    def start(self, operation):
        with self.lock:
            if self.job['busy']:
                raise ValueError('A job is running; wait or cancel it first')
            self.cancel.clear()
            self.job = dict(busy=True, message='Starting', error=None, export=None)
        def worker():
            try:
                operation()
            except Exception as exc:
                with self.lock:
                    self.job['error'] = str(exc)
                    self.job['message'] = 'Needs attention'
            finally:
                with self.lock:
                    self.job['busy'] = False
        self.worker = threading.Thread(target=worker, daemon=True)
        self.worker.start()

    def progress(self, message):
        with self.lock:
            self.job['message'] = message

    def open(self, data):
        path = Path(data['path']).expanduser().resolve()
        workspace = Path(data.get('workspace') or (str(path) + '.review')).expanduser().resolve()
        if path.suffix.lower() == '.json':
            workspace = path.parent
            if path.name == 'project.json' and (workspace / 'transcript.json').exists():
                source = Path(review.read(path)['source']).expanduser().resolve()
            elif path.name == 'review.json':
                document = review.validate(review.read(path))
                source = Path(data['source']).expanduser().resolve() if data.get('source') else review.source_path(document, workspace)
            else:
                raise ValueError('Open review.json, or a legacy editor project.json')
        else:
            source = path
        def operation():
            # Keep the previous session until this one has passed source validation.
            chosen_model = data.get('model') or self.default_model
            document = review.prepare(source, workspace, chosen_model, data.get('transcript'), self.progress, self.cancel)
            with self.lock:
                self.workspace, self.document = workspace, document
                if chosen_model:
                    self.default_model = chosen_model
                    review.write(self.home / 'settings.json', {'model': chosen_model})
        self.start(operation)
        self.last_open = dict(data)

    def save(self, data):
        with self.lock:
            if self.job['busy'] or self.document is None:
                raise ValueError('Wait for preparation/export to finish before saving')
            if data.get('source_sha256') != self.document['source']['sha256']:
                raise ValueError('A different recording is now open. Reload before editing.')
            if data.get('revision') != self.document['revision']:
                raise ValueError('This review changed in another tab. Reload before editing.')
            # Browser owns annotation fields, never source identity or transcription timing.
            updated = copy.deepcopy(self.document)
            updated['marks'], updated['objects'] = data['marks'], data['objects']
            review.validate(updated)
            updated['revision'] += 1
            review.write(self.workspace / 'review.json', updated)
            self.document = updated
            return updated['revision']

    def export(self, render):
        with self.lock:
            if self.document is None:
                raise ValueError('Open a prepared video first')
            document, workspace = copy.deepcopy(self.document), self.workspace
        def operation():
            result = review.export(document, workspace, render, self.progress, self.cancel)
            with self.lock:
                self.job['export'] = result
        self.start(operation)


class Handler(BaseHTTPRequestHandler):
    server_version = 'VideoReview/1'

    def log_message(self, fmt, *args):
        # Never log launch tokens or private media paths.
        pass

    def headers_ok(self, protected=False):
        port = self.server.server_address[1]
        hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}
        if self.headers.get('Host') not in hosts:
            self.send_error(403)
            return False
        origin = self.headers.get('Origin')
        if origin and origin not in {'http://' + h for h in hosts}:
            self.send_error(403)
            return False
        if protected:
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            token = self.headers.get('X-Review-Token') or query.get('token', [''])[0]
            if not secrets.compare_digest(token, self.server.token):
                self.send_error(403)
                return False
        return True

    def json(self, data, code=200):
        raw = json.dumps(data, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if not self.headers_ok(path.startswith('/api/') or path == '/media'):
            return
        if path == '/api/state':
            return self.json(self.server.session.snapshot())
        if path == '/media':
            state = self.server.session
            with state.lock:
                media = state.workspace / 'source/preview.mp4' if state.workspace else None
            if media is None or not media.is_file():
                return self.send_error(404)
            return self.file(media, ranges=True)
        files = {'/': 'index.html', '/app.js': 'app.js', '/model.mjs': 'model.mjs', '/style.css': 'style.css'}
        if path not in files:
            return self.send_error(404)
        self.file(WEB / files[path])

    def file(self, path, ranges=False):
        size = path.stat().st_size
        start, end, partial = 0, size - 1, False
        if ranges and self.headers.get('Range'):
            import re
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', self.headers['Range'])
            try:
                if not match or not any(match.groups()):
                    raise ValueError()
                first, last = match.groups()
                if not first:
                    start = max(0, size - int(last))
                else:
                    start = int(first)
                    end = min(size - 1, int(last)) if last else size - 1
                if start > end or start >= size:
                    raise ValueError()
                partial = True
            except ValueError:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
        self.send_response(206 if partial else 200)
        self.send_header('Content-Type', mimetypes.guess_type(path)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(end-start+1))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'")
        if ranges:
            self.send_header('Accept-Ranges', 'bytes')
        if partial:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        try:
            with path.open('rb') as stream:
                stream.seek(start)
                remaining = end-start+1
                while remaining:
                    chunk = stream.read(min(1024*1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_POST(self):
        if not self.headers_ok(True):
            return
        path = urllib.parse.urlsplit(self.path).path
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if path == '/api/upload':
                return self.upload(length)
            if not 0 < length < 16 * 1024 * 1024 or self.headers.get_content_type() != 'application/json':
                raise ValueError('Expected a JSON request under 16 MB')
            data = json.loads(self.rfile.read(length))
            state = self.server.session
            if path == '/api/open':
                state.open(data)
            elif path == '/api/retry':
                if not state.last_open:
                    raise ValueError('No preparation to retry')
                state.open(state.last_open)
            elif path == '/api/save':
                return self.json(dict(revision=state.save(data)))
            elif path == '/api/export':
                state.export(bool(data.get('render')))
            elif path == '/api/cancel':
                state.cancel.set()
            else:
                return self.send_error(404)
            self.json({'ok': True})
        except (ValueError, KeyError, TypeError, OSError) as exc:
            self.json({'error': str(exc)}, 400)

    def upload(self, length):
        state = self.server.session
        if not 0 < length <= 100 * 1024**3:
            raise ValueError('Choose a video under 100 GB, or open its local path')
        with state.lock:
            if state.job['busy']:
                raise ValueError('Wait for the current job first')
        name = Path(urllib.parse.unquote(self.headers.get('X-Filename', 'video.mp4')).replace('\\', '/')).name
        destination = state.home / uuid.uuid4().hex / 'original' / name
        destination.parent.mkdir(parents=True)
        temporary = destination.with_name(destination.name + '.upload')
        try:
            with temporary.open('wb') as stream:
                remaining = length
                while remaining:
                    chunk = self.rfile.read(min(1024*1024, remaining))
                    if not chunk:
                        raise ValueError('Upload interrupted')
                    stream.write(chunk)
                    remaining -= len(chunk)
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)
        self.json(dict(path=str(destination), workspace=str(destination.parent.parent)))


def make_server(port=0, home=None, model=None, handler=Handler):
    server = ThreadingHTTPServer(('127.0.0.1', port), handler)
    server.daemon_threads = True
    server.token = secrets.token_urlsafe(32)
    server.session = Session(home or Path.home() / 'VideoReviews', model)
    return server


def main(handler=Handler):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', nargs='?', help='Video path or saved review.json')
    parser.add_argument('--port', type=int, default=8091)
    parser.add_argument('--workspace')
    parser.add_argument('--model', default=os.environ.get('WHISPER_MODEL'))
    parser.add_argument('--transcript')
    parser.add_argument('--home', help='Folder for videos selected through the browser')
    args = parser.parse_args()
    server = make_server(args.port, args.home, args.model, handler)
    if args.video:
        server.session.open(dict(path=args.video, workspace=args.workspace, model=args.model, transcript=args.transcript))
    print(f'Open http://127.0.0.1:{server.server_address[1]}/#token={server.token}', flush=True)
    print('Local only. Ctrl+C stops the app. Reviews save automatically.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.session.cancel.set()
    finally:
        server.server_close()
        if server.session.worker:
            server.session.worker.join(timeout=5)


if __name__ == '__main__':
    main()
