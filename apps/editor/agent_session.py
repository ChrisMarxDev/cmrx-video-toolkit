#!/usr/bin/env python3
"""Agent lifecycle around the ordinary browser editor; no UI or rendering policy."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import threading
import urllib.parse
import uuid

import review
import server


class AgentSession(server.Session):
    def __init__(self, home, model=None):
        super().__init__(home, model)
        self.session_id = str(uuid.uuid4())
        self.finished = threading.Event()
        self.outcome = None
        self.opened = False

    def open(self, data):
        with self.lock:
            if self.outcome:
                raise ValueError('This session has ended. Start a new review.')
            if self.opened and data != self.last_open:
                raise ValueError('An agent session reviews one recording. Start a new session to switch.')
            super().open(data)
            self.opened = True

    def save(self, data):
        with self.lock:
            if self.outcome:
                raise ValueError('This session has ended. Start a new review to edit it.')
            return super().save(data)

    def result(self):
        with self.lock:
            if self.outcome:
                return dict(self.outcome)
            status = 'preparing' if self.job['busy'] else 'failed' if self.job['error'] else 'reviewing' if self.document else 'waiting'
            return dict(sessionId=self.session_id, status=status,
                        artifactPath=str(self.workspace / 'review.json') if self.workspace else None,
                        revision=self.document['revision'] if self.document else None,
                        sourceSha256=self.document['source']['sha256'] if self.document else None,
                        error=self.job['error'])

    def finish(self, data):
        with self.lock:
            if data.get('sessionId') != self.session_id:
                raise ValueError('Wrong review session')
            if self.outcome:
                if self.outcome['status'] == 'completed' and data.get('revision') == self.outcome['revision'] and data.get('sourceSha256') == self.outcome['sourceSha256']:
                    return dict(self.outcome)
                raise ValueError('This session has already ended')
            if self.job['busy'] or self.job['error'] or not self.document:
                raise ValueError('Wait for a successfully prepared review before Done')
            if data.get('revision') != self.document['revision'] or data.get('sourceSha256') != self.document['source']['sha256']:
                raise ValueError('Review changed. Save and reload before Done.')
            artifact = self.workspace / 'review.json'
            raw = artifact.read_bytes()
            if review.validate(json.loads(raw)) != self.document:
                raise ValueError('Review changed on disk. Reopen it before Done.')
            outcome = dict(self.result(), status='completed', artifactSha256=hashlib.sha256(raw).hexdigest(),
                           receiptPath=str(self.workspace / 'review-completion.json'))
            review.write(Path(outcome['receiptPath']), outcome)
            self.outcome = outcome
            self.finished.set()
            return dict(outcome)

    def abandon(self):
        with self.lock:
            if not self.outcome:
                self.cancel.set()
                self.outcome = dict(self.result(), status='cancelled')
                self.finished.set()
            return dict(self.outcome)


class AgentHandler(server.Handler):
    def do_GET(self):
        if urllib.parse.urlsplit(self.path).path == '/api/session':
            if self.headers_ok(True):
                self.json(self.server.session.result())
            return
        super().do_GET()

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        if path not in ('/api/finish', '/api/abandon'):
            return super().do_POST()
        if not self.headers_ok(True):
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length < 4096 or self.headers.get_content_type() != 'application/json':
                raise ValueError('Expected a small JSON request')
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError('Expected a JSON object')
            if data.get('sessionId') != self.server.session.session_id:
                raise ValueError('Wrong review session')
            result = self.server.session.finish(data) if path == '/api/finish' else self.server.session.abandon()
            self.json(result)
        except (ValueError, KeyError, TypeError, OSError) as exc:
            self.json({'error': str(exc)}, 400)


def make_server(port=0, home=None, model=None):
    instance = server.make_server(port, home, model, AgentHandler)
    instance.session = AgentSession(instance.session.home, model)
    return instance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', nargs='?', help='Recording or existing review.json')
    parser.add_argument('--workspace')
    parser.add_argument('--model')
    parser.add_argument('--transcript')
    parser.add_argument('--home')
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--wait', action='store_true', help='Exit with a JSON result after explicit Done/cancel')
    args = parser.parse_args()
    instance = make_server(args.port, args.home, args.model)
    thread = threading.Thread(target=instance.serve_forever, daemon=True)
    thread.start()
    try:
        if args.video:
            instance.session.open(dict(path=args.video, workspace=args.workspace, model=args.model, transcript=args.transcript))
        origin = f'http://127.0.0.1:{instance.server_address[1]}'
        print(json.dumps(dict(event='started', sessionId=instance.session.session_id, origin=origin,
                              browserUrl=f'{origin}/#token={instance.token}', token=instance.token)), flush=True)
        if args.wait:
            instance.session.finished.wait()
        else:
            thread.join()
    except KeyboardInterrupt:
        instance.session.abandon()
    finally:
        instance.session.cancel.set()
        instance.shutdown()
        instance.server_close()
        if instance.session.worker:
            instance.session.worker.join(timeout=5)
    result = instance.session.result()
    print(json.dumps(dict(event='result', **result)), flush=True)
    return 0 if result['status'] == 'completed' else 130


if __name__ == '__main__':
    sys.exit(main())
