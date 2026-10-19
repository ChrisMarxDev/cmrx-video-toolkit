import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import models


class ModelSetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.home_patch = patch.object(Path, 'home', return_value=self.home)
        self.home_patch.start()
        self.addCleanup(self.home_patch.stop)
        self.env_patch = patch.dict('os.environ', {'XDG_CACHE_HOME': str(self.home / 'cache'), 'WHISPER_MODEL': ''})
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def test_session_reuses_global_saved_model_without_download(self):
        model = self.home / 'existing.bin'
        model.write_bytes(b'existing model')
        settings = self.home / 'VideoReviews/settings.json'
        settings.parent.mkdir()
        settings.write_text(json.dumps({'model': str(model)}))
        with patch.object(models.urllib.request, 'urlopen', side_effect=AssertionError('No download')):
            self.assertEqual(models.resolve_model(), model)

    def test_verified_download_is_reused_and_partial_failures_removed(self):
        payload = b'synthetic model'
        with patch.object(models, 'BASE_SIZE', len(payload)), patch.object(models, 'BASE_SHA256', hashlib.sha256(payload).hexdigest()):
            with patch.object(models.urllib.request, 'urlopen', return_value=io.BytesIO(b'bad')):
                with self.assertRaisesRegex(ValueError, 'verification'):
                    models.resolve_model()
            self.assertEqual(list(models.cache_dir().iterdir()), [])
            with patch.object(models.urllib.request, 'urlopen', return_value=io.BytesIO(payload)) as download:
                result = models.resolve_model()
                self.assertEqual(result.read_bytes(), payload)
                self.assertEqual(models.resolve_model(), result)
                self.assertEqual(download.call_count, 1)

    def test_cancel_and_explicit_missing_model_do_not_download(self):
        cancel = threading.Event()
        cancel.set()
        with patch.object(models.urllib.request, 'urlopen', side_effect=AssertionError('No download')):
            with self.assertRaisesRegex(ValueError, 'Cancelled'):
                models.resolve_model(cancel=cancel)
            with self.assertRaisesRegex(ValueError, 'override'):
                models.resolve_model(str(self.home / 'missing.bin'))
