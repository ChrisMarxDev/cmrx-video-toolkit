"""Linked originals share cuts; decoded colors verify fixed-offset synchronization."""
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from scripts import video

@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg required')
class LinkedSourceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.p = Path(self.tmp.name)
        self.primary, self.screen = self.p / 'face.mp4', self.p / 'screen.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y',
            '-f', 'lavfi', '-i', 'color=red:s=96x64:r=30:d=1',
            '-f', 'lavfi', '-i', 'color=green:s=96x64:r=30:d=1',
            '-f', 'lavfi', '-i', 'color=blue:s=96x64:r=30:d=2',
            '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
            '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]',
            '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-c:a', 'aac', str(self.primary)], check=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(self.primary),
            '-vf', 'tpad=start_duration=0.5:start_mode=clone', '-an', '-c:v', 'libx264', str(self.screen)], check=True)
        video.write(self.p / 'project.json', dict(version=1, source=str(self.primary), fps=30, width=192, height=64))
        video.write(self.p / 'annotations.json', dict(version=1, notes=[]))
        self.ranges = [dict(clip_id='intro', source_start=.5, source_end=1.3), dict(clip_id='detail', source_start=2.2, source_end=3.0)]
        video.write(self.p / 'input.json', dict(version=2, videoPath=str(self.primary), retainedRanges=self.ranges))
        video.import_edit(self.args(file=str(self.p / 'input.json')))
        self.link()

    def args(self, **kwargs):
        return SimpleNamespace(project=str(self.p), **kwargs)

    def link(self, **changes):
        values = dict(source_id='screen', source=str(self.screen), offset=.5, remove=False)
        video.link_source(self.args(**(values | changes)))

    def prepare(self):
        video.prepare_clips(self.args())
        return video.read(self.p / 'edit/clips.json')

    def asset(self, clip):
        return self.p / 'composition' / clip['asset']

    def channel(self, clip, time):
        pixels = subprocess.check_output(['ffmpeg', '-v', 'error', '-ss', str(time), '-i', str(self.asset(clip)),
            '-frames:v', '1', '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
        self.assertEqual(len(pixels), 3)
        return max(range(3), key=lambda i: pixels[i])

    def test_paired_frames_audio_and_generated_scene(self):
        m = self.prepare()
        self.assertEqual(m['version'], 2)
        linked = m['companions'][0]['clips']
        for a, b in zip(m['clips'], linked):
            self.assertEqual(a['clip_id'], b['clip_id'])
            self.assertEqual(a['output_start'], b['output_start'])
            self.assertAlmostEqual(a['media_duration'], b['media_duration'], delta=1/30)
            self.assertAlmostEqual(a['source_start'] + .5, b['source_start'])
            self.assertEqual({s['codec_type'] for s in video.probe(self.asset(b))['streams']}, {'video'})
        for index, time, expected in [(0, .1, 0), (0, .65, 1), (1, .1, 2), (0, .1, 0)]:
            self.assertEqual(self.channel(m['clips'][index], time), expected)
            self.assertEqual(self.channel(linked[index], time), expected)
        video.compose(self.args(replace=False, companion='screen'))
        dart = (self.p / 'composition/lib/main.dart').read_text()
        self.assertIn('sourceId: "screen"', dart)
        self.assertIn('ClipAudio.muted()', dart)
        with self.assertRaisesRegex(ValueError, 'Composition exists'):
            video.compose(self.args(replace=False, companion='screen'))

    def test_adjust_regenerates_both_and_reuses_other_pair(self):
        before = self.prepare()
        self.assertEqual(before, self.prepare())
        video.adjust_clip(self.args(clip_id='intro', start=.2, end=None))
        after = self.prepare()
        for old, new in [(before['clips'], after['clips']), (before['companions'][0]['clips'], after['companions'][0]['clips'])]:
            self.assertNotEqual(old[0]['asset'], new[0]['asset'])
            self.assertEqual(old[1]['asset'], new[1]['asset'])
        self.assertAlmostEqual(after['companions'][0]['clips'][0]['source_start'], .7)

    def test_invalid_offsets_and_ids_preserve_config(self):
        before = (self.p / 'project.json').read_bytes()
        for changes in [dict(offset=float('nan')), dict(offset=float('inf')), dict(offset=True), dict(offset=-1),
                        dict(offset=10), dict(source_id='primary'), dict(source_id='../bad'), dict(source=str(self.p / 'missing.mp4'))]:
            with self.assertRaises(ValueError):
                self.link(**changes)
            self.assertEqual(before, (self.p / 'project.json').read_bytes())

    def test_missing_coverage_adjustment_preserves_timeline(self):
        self.link(offset=-.4)
        self.prepare()
        before = (self.p / 'edit/timeline.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'does not cover'):
            video.adjust_clip(self.args(clip_id='intro', start=.1, end=None))
        self.assertEqual(before, (self.p / 'edit/timeline.json').read_bytes())

    def test_changes_and_removal_invalidate_prepared_manifest(self):
        self.prepare()
        timeline = video.read(self.p / 'edit/timeline.json')
        self.link(offset=.4)
        with self.assertRaisesRegex(ValueError, 'Linked sources changed'):
            video.checked_clips(self.p, timeline)
        self.prepare()
        self.link(remove=True)
        with self.assertRaisesRegex(ValueError, 'Linked sources changed'):
            video.checked_clips(self.p, timeline)
        self.assertNotIn('companions', self.prepare())

    def test_source_and_cache_corruption_detected(self):
        m = self.prepare()
        timeline = video.read(self.p / 'edit/timeline.json')
        self.asset(m['companions'][0]['clips'][0]).write_bytes(b'broken')
        with self.assertRaisesRegex(ValueError, 'Prepared clip changed'):
            video.checked_clips(self.p, timeline)
        self.prepare()
        self.screen.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'Linked source changed'):
            video.checked_clips(self.p, timeline)

    def test_failure_does_not_publish_partial_companions(self):
        self.prepare()
        before = {name: (self.p/name).read_bytes() for name in ['edit/clips.json', 'composition/lib/source_clips.dart']}
        self.link(offset=.4)
        original = video.prepare_source_clips
        def failing(*args, **kwargs):
            if kwargs.get('silent'):
                raise ValueError('synthetic companion failure')
            return original(*args, **kwargs)
        with patch.object(video, 'prepare_source_clips', side_effect=failing):
            with self.assertRaisesRegex(ValueError, 'synthetic'):
                self.prepare()
        for name, contents in before.items():
            self.assertEqual(contents, (self.p/name).read_bytes())

    def test_companion_audio_is_removed_even_when_present(self):
        self.link(source=str(self.primary), offset=0)
        m = self.prepare()
        self.assertEqual({x['codec_type'] for x in video.probe(self.asset(m['companions'][0]['clips'][0]))['streams']}, {'video'})

    def test_missing_file_can_be_unlinked(self):
        self.screen.unlink()
        self.link(remove=True)
        self.assertEqual(video.read(self.p / 'project.json')['companions'], [])

    def test_import_rejects_uncovered_ranges_without_writing(self):
        self.link(offset=-.4)
        before = (self.p / 'edit/timeline.json').read_bytes()
        video.write(self.p / 'input.json', dict(version=2, videoPath=str(self.primary),
            retainedRanges=[dict(source_start=0, source_end=1)]))
        with self.assertRaisesRegex(ValueError, 'does not cover'):
            video.import_edit(self.args(file=str(self.p / 'input.json')))
        self.assertEqual(before, (self.p / 'edit/timeline.json').read_bytes())

    def test_multiple_companions_and_duplicate_ids(self):
        self.link(source_id='other', source=str(self.primary), offset=0)
        m = self.prepare()
        self.assertEqual([x['id'] for x in m['companions']], ['screen', 'other'])
        config = video.read(self.p / 'project.json')
        config['companions'].append(config['companions'][0])
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            video.companion_sources(config)

if __name__ == '__main__':
    unittest.main()
