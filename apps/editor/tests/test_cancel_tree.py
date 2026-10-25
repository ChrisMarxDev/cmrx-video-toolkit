import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import review


class CancelTreeTest(unittest.TestCase):
    def test_pipeline_cancellation_stops_descendant_encoder(self):
        with tempfile.TemporaryDirectory() as folder:
            marker = Path(folder) / 'encoded'
            child = f'import time; from pathlib import Path; time.sleep(1); Path({str(marker)!r}).write_text("orphan")'
            parent = f'import subprocess,sys,time; subprocess.Popen([sys.executable,"-c",{child!r}]); time.sleep(10)'
            cancel = threading.Event()
            timer = threading.Timer(.3, cancel.set)
            timer.start()
            try:
                with self.assertRaisesRegex(ValueError, 'Cancelled'):
                    review.run([sys.executable, '-c', parent], cancel)
            finally:
                timer.cancel()
            time.sleep(1)
            self.assertFalse(marker.exists())
