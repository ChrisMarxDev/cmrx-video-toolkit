import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import http.client

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent_session
import review
from test_review import document


class AgentSessionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.server = agent_session.make_server(home=self.temp.name)
        self.state = self.server.session
        self.state.workspace = Path(self.temp.name)
        self.state.document = document()
        review.write(self.state.workspace / 'review.json', self.state.document)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.identity = dict(sessionId=self.state.session_id, revision=0, sourceSha256='0'*64)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path, data=None, token=None, origin=None):
        connection = http.client.HTTPConnection(*self.server.server_address)
        headers = {'X-Review-Token': token or self.server.token, 'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = origin
        connection.request('GET' if data is None else 'POST', path, None if data is None else json.dumps(data), headers)
        response = connection.getresponse()
        status, raw = response.status, response.read()
        connection.close()
        return status, json.loads(raw) if status != 403 else None

    def test_explicit_done_persists_receipt_and_freezes_session(self):
        self.assertFalse(self.state.finished.is_set())
        code, result = self.request('/api/finish', self.identity)
        self.assertEqual(code, 200)
        self.assertEqual(result['status'], 'completed')
        self.assertTrue(self.state.finished.is_set())
        self.assertEqual(review.read(Path(result['receiptPath'])), result)
        self.assertEqual(result['artifactSha256'], hashlib.sha256(Path(result['artifactPath']).read_bytes()).hexdigest())
        self.assertEqual(self.request('/api/finish', self.identity)[1], result)
        payload = dict(revision=0, source_sha256='0'*64, marks=[], objects=[])
        self.assertEqual(self.request('/api/save', payload)[0], 400)
        self.assertEqual(self.request('/api/open', {'path': 'different.mp4'})[0], 400)

    def test_stale_unsaved_busy_and_disk_changes_cannot_finish(self):
        for key, value in [('sessionId', 'wrong'), ('revision', 1), ('sourceSha256', 'f'*64)]:
            self.assertEqual(self.request('/api/finish', dict(self.identity, **{key: value}))[0], 400)
        self.state.job['busy'] = True
        self.assertEqual(self.request('/api/finish', self.identity)[0], 400)
        self.state.job['busy'] = False
        changed = copy.deepcopy(self.state.document)
        changed['revision'] = 2
        review.write(self.state.workspace / 'review.json', changed)
        self.assertEqual(self.request('/api/finish', self.identity)[0], 400)
        self.assertFalse(self.state.finished.is_set())
        self.assertFalse((self.state.workspace / 'review-completion.json').exists())

    def test_cancel_preserves_draft_and_auth_is_required(self):
        original = (self.state.workspace / 'review.json').read_bytes()
        self.assertEqual(self.request('/api/session', token='wrong')[0], 403)
        self.assertEqual(self.request('/api/finish', self.identity, origin='https://example.com')[0], 403)
        self.assertEqual(self.request('/api/finish', [1])[0], 400)
        code, result = self.request('/api/abandon', {'sessionId': self.state.session_id})
        self.assertEqual((code, result['status']), (200, 'cancelled'))
        self.assertEqual((self.state.workspace / 'review.json').read_bytes(), original)
        self.assertEqual(self.request('/api/finish', self.identity)[0], 400)


if __name__ == '__main__':
    unittest.main()
