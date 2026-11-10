import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('notarize', Path(__file__).with_name('notarize.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NotarizeTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.artifact = Path(self.directory.name) / 'app.zip'
        self.artifact.write_bytes(b'signed candidate')
        self.state = dict(artifact=str(self.artifact), sha256=module.digest(self.artifact), phase='ready', target='Test.app')
        self.calls = []
        self.status = 'In Progress'

    def execute(self, *args):
        self.calls.append(args)
        if 'submit' in args:
            return json.dumps(dict(id='apple-id'))
        if 'info' in args:
            return json.dumps(dict(id='apple-id', status=self.status))
        return '{}'

    def advance(self, execute=None, **kwargs):
        return module.advance(self.state, self.artifact, 'saved-profile', lambda state: None, execute or self.execute, **kwargs)

    def test_pending_retry_does_not_submit_twice(self):
        self.advance()
        self.advance()
        self.assertEqual(sum('submit' in args for args in self.calls), 1)
        self.assertEqual(self.state['phase'], 'submitted')

    def test_unknown_outcome_requires_recovery(self):
        def disconnect(*args):
            if 'submit' in args:
                raise subprocess.CalledProcessError(1, args)
            return '{}'
        with self.assertRaises(subprocess.CalledProcessError):
            self.advance(disconnect)
        with self.assertRaisesRegex(ValueError, 'outcome unknown'):
            self.advance()
        self.assertEqual(self.calls, [])
        self.advance(submission_id='apple-id')
        self.assertFalse(any('submit' in args for args in self.calls))

    def test_missing_profile_leaves_safe_ready_state(self):
        def missing(*args):
            raise subprocess.CalledProcessError(69, args)
        with self.assertRaises(subprocess.CalledProcessError):
            self.advance(missing)
        self.assertEqual(self.state['phase'], 'ready')

    def test_rejection_and_changed_bytes_stop(self):
        self.status = 'Invalid'
        with self.assertRaisesRegex(ValueError, 'Apple status'):
            self.advance()
        self.artifact.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'bytes changed'):
            self.advance()

    def test_accepted_staples_once_then_only_validates(self):
        self.status = 'Accepted'
        validation = [False]
        def command(*args):
            if 'validate' in args and not validation[0]:
                raise subprocess.CalledProcessError(1, args)
            if 'staple' in args:
                validation[0] = True
            return self.execute(*args)
        self.advance(command)
        self.advance(command)
        self.assertEqual(self.state['phase'], 'complete')
        self.assertEqual(sum('staple' in args for args in self.calls), 1)

    def test_dmg_final_hash_recorded(self):
        self.state['target'] = str(self.artifact)
        self.status = 'Accepted'
        def command(*args):
            if 'validate' in args:
                self.artifact.write_bytes(b'stapled dmg')
            return self.execute(*args)
        self.advance(command)
        self.assertEqual(self.state['sha256'], module.digest(self.artifact))


if __name__ == '__main__':
    unittest.main()
