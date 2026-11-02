"""Signal-level invariants for localized word emphasis."""
import array
import importlib.util
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import wave

SCRIPT = Path(__file__).resolve().parents[1] / '.skills/audio-effects/scripts/flutter_word.py'
spec = importlib.util.spec_from_file_location('flutter_word', SCRIPT)
flutter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flutter)


class FlutterTests(unittest.TestCase):
    def test_timing_context_channels_and_energy(self):
        sr = 16000
        mono = [round(9000 * math.sin(2 * math.pi * 330 * i / sr)) for i in range(sr)]
        stereo = array.array('h', (v for x in mono for v in (x, -x)))
        result = flutter.process(stereo, 2, sr, .2, .8, 29, 1.6, .5)
        first, stop = 6400, 25600
        self.assertEqual(len(stereo), len(result))
        self.assertEqual(result[:first], stereo[:first])
        self.assertEqual(result[stop:], stereo[stop:])
        self.assertNotEqual(result[first:stop], stereo[first:stop])
        self.assertTrue(all(result[i] == -result[i+1] for i in range(0, len(result), 2)))
        ratio = sum(v*v for v in result[first:stop]) / sum(v*v for v in stereo[first:stop])
        self.assertAlmostEqual(ratio, 1, places=4)
        self.assertEqual(result, flutter.process(stereo, 2, sr, .2, .8, 29, 1.6, .5))
        self.assertEqual(stereo, flutter.process(stereo, 2, sr, .2, .8, 29, 1.6, 0))

    def test_invalid_windows_and_parameters(self):
        samples = array.array('h', [0]*1000)
        for start, end in [(-1, .2), (.1, .1), (.9, 2), (float('nan'), .8)]:
            with self.assertRaises(ValueError):
                flutter.process(samples, 1, 1000, start, end, 29, 1.6, .5)
        self.assertEqual(samples, flutter.process(samples, 1, 1000, .1, .8, 29, 1.6, .5))

    def test_cli_protects_existing_output_and_roundtrips_wav(self):
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder)/'in.wav', Path(folder)/'out.wav'
            with wave.open(str(source), 'wb') as f:
                f.setparams((1, 2, 8000, 0, 'NONE', 'not compressed'))
                f.writeframes(b'\0\0'*8000)
            args = [sys.executable, str(SCRIPT), '--input', str(source), '--output', str(output),
                    '--start', '.2', '--end', '.8', '--rate', '29', '--depth-ms', '1.6', '--mix', '.5']
            subprocess.run(args, check=True, capture_output=True)
            with wave.open(str(output)) as f:
                self.assertEqual(f.getnframes(), 8000)
                self.assertEqual(f.getframerate(), 8000)
            original = output.read_bytes()
            self.assertNotEqual(subprocess.run(args, capture_output=True).returncode, 0)
            self.assertEqual(output.read_bytes(), original)
