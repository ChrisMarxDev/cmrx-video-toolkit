import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('video', ROOT / 'scripts/video.py')
video = importlib.util.module_from_spec(spec)
spec.loader.exec_module(video)


def fixture():
    return dict(version=1, words=[
        dict(word='A', start=.2, end=.5),
        dict(word='uhm', start=.6, end=.8),
        dict(word='question', start=1., end=1.4),
        dict(word='arrives', start=1.5, end=1.8),
    ], deletedRanges=[dict(wordIndices=[1])])


class TimelineTests(unittest.TestCase):
    def test_cut_matches_word_runs_not_range_envelope(self):
        data = fixture()
        data['deletedRanges'][0].update(start=0, end=2)
        result = video.import_cut(data, 2)
        self.assertEqual([(s['source_start'], s['source_end']) for s in result['spans']], [(.2, .5), (1., 1.8)])
        self.assertAlmostEqual(result['duration'], 1.1)
        self.assertEqual([w['id'] for w in result['words']], ['w000000', 'w000002', 'w000003'])
        self.assertAlmostEqual(result['words'][1]['start'], .3)

    def test_note_crossing_cut_maps_to_surviving_windows(self):
        timeline = video.import_cut(fixture(), 2)
        result = video.map_annotations({'version': 1, 'notes': [dict(id='a', source_start=.3, source_end=1.3)]}, timeline)
        self.assertEqual(len(result['notes'][0]['windows']), 2)
        self.assertAlmostEqual(result['notes'][0]['windows'][1]['end'], .6)

    def test_removed_note_is_flagged(self):
        result = video.map_annotations({'version': 1, 'notes': [dict(id='a', source_start=.6, source_end=.8)]}, video.import_cut(fixture(), 2))
        self.assertEqual(result['notes'][0]['status'], 'removed-by-edit')
        self.assertEqual(result['notes'][0]['windows'], [])

    def test_all_words_removed_rejected(self):
        data = fixture(); data['deletedRanges'] = [dict(wordIndices=[0, 1, 2, 3])]
        with self.assertRaises(ValueError): video.import_cut(data, 2)

    def test_invalid_deletion_rejected(self):
        for index in [-1, 9, True, 1.2]:
            data = fixture(); data['deletedRanges'] = [dict(wordIndices=[index])]
            with self.assertRaises(ValueError): video.import_cut(data, 2)

    def test_nonfinite_and_overlapping_times_rejected(self):
        for start in [float('nan'), float('inf'), -.1, .3]:
            data = fixture(); data['words'][1]['start'] = start
            with self.assertRaises(ValueError): video.import_cut(data, 2)

    def test_revision_changes_on_new_edit(self):
        data = fixture(); before = video.import_cut(data, 2)
        data['deletedRanges'] = []
        self.assertNotEqual(before['revision'], video.import_cut(data, 2)['revision'])

    def test_no_words_preserves_whole_source(self):
        result = video.import_cut(dict(version=1, words=[], deletedRanges=[]), 2)
        self.assertEqual(result['duration'], 2)

    def test_dart_interpolation_escaped(self):
        self.assertEqual(video.dart_string('cost $5'), '"cost \\$5"')


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg required')
class MediaIntegrationTests(unittest.TestCase):
    def test_import_cut_compose_and_stale_revision_guard(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            source = p / 'original.mp4'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=2',
                            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264',
                            '-c:a', 'aac', '-shortest', str(source)], check=True)
            video.write(p / 'project.json', dict(source=str(source), fps=30))
            video.write(p / 'annotations.json', dict(version=1, notes=[]))
            data = fixture(); data['videoPath'] = str(source)
            video.write(p / 'edit.json', data)
            (p / 'composition/assets').mkdir(parents=True)
            (p / 'composition/lib').mkdir(parents=True)
            def call(*args):
                return subprocess.run(['python3', str(ROOT / 'scripts/video.py'), *map(str, args)], capture_output=True, text=True)
            for command in [('import-edit', p, p / 'edit.json'), ('cut', p), ('compose', p)]:
                result = call(*command)
                self.assertEqual(result.returncode, 0, result.stderr)
            info = video.probe(p / 'composition/assets/rough-cut.mp4')
            self.assertLess(abs(float(info['format']['duration']) - 1.1), .1)
            self.assertEqual({s['codec_type'] for s in info['streams']}, {'audio', 'video'})
            self.assertTrue((p / 'edit/narration.wav').exists())
            self.assertIn("Clip.asset('assets/rough-cut.mp4'", (p / 'composition/lib/main.dart').read_text())
            self.assertIn(str(ROOT / 'components'), (p / 'composition/pubspec.yaml').read_text())
            self.assertIn('Background.color(const Color(0xFF000000))', (p / 'composition/lib/main.dart').read_text())
            self.assertNotEqual(call('compose', p).returncode, 0)
            timeline = video.read(p / 'edit/timeline.json'); timeline['revision'] = 'changed'
            video.write(p / 'edit/timeline.json', timeline)
            result = call('preview', p)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('stale', result.stderr)


if __name__ == '__main__':
    unittest.main()
