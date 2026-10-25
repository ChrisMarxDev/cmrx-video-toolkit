import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import visual_map as vm


class Measurements(unittest.TestCase):
    def test_spatial_change_and_region(self):
        result = vm.difference(bytes([100, 100, 0, 0] * 4), bytes(16), 4, 4, 2, 2, 12, [0, 0, 2, 4])
        self.assertEqual(result['mean'], 50)
        self.assertEqual(result['changed_fraction'], .5)
        self.assertEqual(result['grid_mean'], [100, 0, 100, 0])
        self.assertEqual(result['region_mean'], 100)
        self.assertEqual(result['outside_region_mean'], 0)

    def test_invalid_parameters(self):
        for flags in [['--fps', 'nan'], ['--cols', '321'], ['--region', '0', '0', '0', '1'], ['--min-event', '0']]:
            with self.subTest(flags=flags), self.assertRaises(ValueError):
                vm.validate(vm.parser().parse_args(['source', '--output', 'out'] + flags))


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg required')
class EndToEnd(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'held-position.mkv'
        # Four seconds: still / changed position held for two seconds / return.
        raw = b''.join(bytes([level] * 64) for level in [0] * 4 + [100] * 8 + [0] * 4)
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'rawvideo', '-pixel_format', 'gray',
                        '-video_size', '8x8', '-framerate', '4', '-i', 'pipe:0',
                        '-c:v', 'ffv1', str(self.source)], input=raw, check=True)

    def args(self, source=None, extra=()):
        return vm.parser().parse_args([str(source or self.source), '--output', str(self.root / 'out'),
                                      '--width', '8', '--height', '8', '--cols', '2', '--rows', '2',
                                      '--blur', '0', '--padding', '0'] + list(extra))

    def test_hold_return_lag_and_repeatability(self):
        first = vm.analyze(self.source, self.args())
        self.assertEqual(first, vm.analyze(self.source, self.args()))
        self.assertEqual(len(first['samples']), 16)
        held = first['samples'][7]
        self.assertEqual(held['previous']['mean'], 0)
        self.assertEqual(held['reference']['mean'], 100)
        self.assertIsNone(first['samples'][0]['previous'])
        self.assertIsNone(first['samples'][7]['lag'])
        self.assertEqual(first['samples'][8]['lag']['mean'], 100)
        self.assertEqual(first['samples'][12]['reference']['mean'], 0)
        self.assertEqual(len(first['candidates']), 1)
        self.assertGreaterEqual(first['candidates'][0]['review_end'], 3)

    def test_later_reference_and_out_of_range(self):
        result = vm.analyze(self.source, self.args(extra=['--reference-seconds', '1']))
        self.assertIsNone(result['samples'][3]['reference'])
        self.assertEqual(result['timing']['reference_time'], 1)
        self.assertEqual(result['samples'][4]['reference']['mean'], 0)
        with self.assertRaisesRegex(ValueError, 'beyond'):
            vm.analyze(self.source, self.args(extra=['--reference-seconds', '10']))

    def test_delayed_video_uses_media_origin(self):
        delayed = self.root / 'delayed.mkv'
        subprocess.run(['ffmpeg', '-v', 'error', '-itsoffset', '2', '-i', str(self.source),
                        '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', '6',
                        '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'pcm_s16le', str(delayed)], check=True)
        result = vm.analyze(delayed, self.args(delayed))
        self.assertEqual(result['timing']['analyzed_start'], 2)
        self.assertEqual(result['timing']['reference_time'], 2)
        self.assertEqual(result['samples'][4]['source_time'], 3)

    def test_cli_artifacts_and_no_overwrite(self):
        out = self.root / 'out'
        command = [sys.executable, str(Path(vm.__file__)), str(self.source), '--output', str(out),
                   '--width', '8', '--height', '8', '--cols', '2', '--rows', '2']
        before = vm.fingerprint(self.source)
        subprocess.run(command, check=True, capture_output=True)
        payload = json.loads((out / 'visual-map.json').read_text())
        self.assertEqual(payload['source']['sha256'], before)
        self.assertEqual(vm.fingerprint(self.source), before)
        self.assertTrue((out / 'timeline.svg').is_file())
        failed = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn('already exists', failed.stderr)


if __name__ == '__main__':
    unittest.main()
