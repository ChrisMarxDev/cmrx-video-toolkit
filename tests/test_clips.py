"""Real media checks for addressable footage, cache reuse and scene handoffs."""
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from scripts import video


class IdentityTests(unittest.TestCase):
    def test_range_ids_are_explicit_or_stable_across_position_changes(self):
        ranges = [dict(source_start=.2, source_end=.8), dict(source_start=1, source_end=2)]
        before = video.import_cut(dict(version=2, retainedRanges=ranges), 3)
        ranges[0]['source_end'] = .9
        after = video.import_cut(dict(version=2, retainedRanges=ranges), 3)
        self.assertEqual(before['spans'][1]['clip_id'], after['spans'][1]['clip_id'])
        ranges[0]['clip_id'] = 'intro'
        self.assertEqual(video.import_cut(dict(version=2, retainedRanges=ranges), 3)['spans'][0]['clip_id'], 'intro')

    def test_invalid_and_duplicate_ids_are_rejected(self):
        for identity in ['../clip', '', 4, 'a' * 65]:
            with self.assertRaises(ValueError):
                video.import_cut(dict(version=2, retainedRanges=[dict(clip_id=identity, source_start=0, source_end=1)]), 3)
        with self.assertRaises(ValueError):
            video.import_cut(dict(version=2, retainedRanges=[
                dict(clip_id='same', source_start=0, source_end=1),
                dict(clip_id='same', source_start=2, source_end=3)]), 3)


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg required')
class ClipMediaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.p = Path(self.temp.name)
        self.source = self.p / 'original.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i',
                        'testsrc2=s=160x90:r=30:d=4', '-f', 'lavfi', '-i',
                        'sine=frequency=440:sample_rate=48000:duration=4',
                        '-c:v', 'libx264', '-c:a', 'aac', '-shortest', str(self.source)], check=True)
        self.source_hash = video.file_digest(self.source)
        video.write(self.p / 'project.json', dict(source=str(self.source), fps=30, width=160, height=90))
        video.write(self.p / 'annotations.json', dict(version=1, notes=[dict(id='note', source_start=2.2, source_end=2.4)]))
        self.ranges = [dict(clip_id='intro', source_start=.5, source_end=1.2),
                       dict(clip_id='detail', source_start=2, source_end=2.8)]
        self.import_ranges(self.ranges)

    def args(self, **kwargs):
        return SimpleNamespace(project=str(self.p), **kwargs)

    def import_ranges(self, ranges):
        video.write(self.p / 'input.json', dict(version=2, videoPath=str(self.source), retainedRanges=ranges))
        video.import_edit(self.args(file=str(self.p / 'input.json')))

    def prepare(self):
        video.prepare_clips(self.args())
        return video.read(self.p / 'edit/clips.json')

    def asset(self, clip):
        return self.p / 'composition' / clip['asset']

    def test_adjust_reuses_unchanged_media_and_remaps_scene_data(self):
        before = self.prepare()
        stamps = [self.asset(c).stat().st_mtime_ns for c in before['clips']]
        self.prepare()
        self.assertEqual(stamps, [self.asset(c).stat().st_mtime_ns for c in before['clips']])
        video.compose(self.args(replace=False, legacy_rough_cut=False))
        main = (self.p / 'composition/lib/main.dart').read_text()
        self.assertIn('for (final clip in sourceClips) Scene(', main)
        self.assertNotIn('rough-cut.mp4', main)
        self.assertFalse((self.p / 'composition/assets/rough-cut.mp4').exists())
        old_note = video.read(self.p / 'storyboard/annotations.resolved.json')['notes'][0]['windows'][0]['start']
        video.adjust_clip(self.args(clip_id='intro', start=.3, end=1.4))
        timeline = video.read(self.p / 'edit/timeline.json')
        self.assertEqual([s['clip_id'] for s in timeline['spans']], ['intro', 'detail'])
        with self.assertRaisesRegex(ValueError, 'stale'):
            video.checked_clips(self.p, timeline)
        after = self.prepare()
        self.assertNotEqual(before['clips'][0]['asset'], after['clips'][0]['asset'])
        self.assertEqual(before['clips'][1]['asset'], after['clips'][1]['asset'])
        self.assertEqual(stamps[1], self.asset(after['clips'][1]).stat().st_mtime_ns)
        self.assertAlmostEqual(after['clips'][1]['output_start'], 1.1)
        note = video.read(self.p / 'storyboard/annotations.resolved.json')['notes'][0]['windows'][0]['start']
        self.assertAlmostEqual(note - old_note, .4)
        self.assertEqual(main, (self.p / 'composition/lib/main.dart').read_text())
        with self.assertRaisesRegex(ValueError, 'stale'):
            video.fluvie(self.args(command='preview'))
        self.assertEqual(self.source_hash, video.file_digest(self.source))
        # Explicitly reconcile only after changing actual authored scenes.
        with self.assertRaisesRegex(ValueError, 'exists'):
            video.compose(self.args(replace=False, legacy_rough_cut=False))
        # Shortening back to the original selection reuses its earlier cache too.
        video.adjust_clip(self.args(clip_id='intro', start=.5, end=1.2))
        restored = self.prepare()
        self.assertEqual([c['asset'] for c in before['clips']], [c['asset'] for c in restored['clips']])
        self.assertEqual(stamps, [self.asset(c).stat().st_mtime_ns for c in restored['clips']])

    def test_nonframe_boundaries_have_local_zero_audio_and_video(self):
        self.import_ranges([dict(clip_id='fractional', source_start=.513, source_end=1.237)])
        clip = self.prepare()['clips'][0]
        info = video.probe(self.asset(clip))
        for stream in info['streams']:
            self.assertLessEqual(abs(float(stream.get('start_time', 0))), 1 / 30)
            self.assertLess(abs(float(stream['duration']) - .724), 1 / 30 + .005)
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(self.asset(clip)), '-f', 'null', '-'], check=True)
        self.assertEqual((clip['source_start'], clip['source_end']), (.513, 1.237))

    def test_clips_contain_requested_original_frames(self):
        # Three known source passages distinguish source-time seeking from merely
        # generating files of the right duration at the start of the recording.
        subprocess.run(['ffmpeg', '-v', 'error', '-y',
                        '-f', 'lavfi', '-i', 'color=red:s=160x90:r=30:d=1',
                        '-f', 'lavfi', '-i', 'color=green:s=160x90:r=30:d=1',
                        '-f', 'lavfi', '-i', 'color=blue:s=160x90:r=30:d=2',
                        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
                        '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]',
                        '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-c:a', 'aac',
                        str(self.source)], check=True)
        clips = self.prepare()['clips']
        for index, local_time, channel in [(0, .1, 0), (0, .6, 1), (1, .1, 2)]:
            pixels = subprocess.check_output(['ffmpeg', '-v', 'error', '-ss', str(local_time),
                        '-i', str(self.asset(clips[index])), '-frames:v', '1',
                        '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
            self.assertEqual(max(range(3), key=lambda i: pixels[i]), channel)

    def test_invalid_adjustment_leaves_artifacts_unchanged(self):
        self.prepare()
        files = ['edit/timeline.json', 'edit/decisions.json', 'edit/clips.json', 'storyboard/annotations.resolved.json']
        before = {f: (self.p / f).read_bytes() for f in files}
        for kwargs in [dict(start=-1), dict(end=2.2), dict(end=.4), dict(end=5), dict(end=float('nan'))]:
            with self.assertRaises(ValueError):
                video.adjust_clip(self.args(clip_id='intro', **dict(start=None, end=None) | kwargs))
        self.assertEqual(before, {f: (self.p / f).read_bytes() for f in files})

    def test_settings_source_and_corrupt_cache_invalidation(self):
        first = self.prepare()
        self.asset(first['clips'][0]).write_bytes(b'broken')
        repaired = self.prepare()
        self.assertNotEqual(self.asset(repaired['clips'][0]).read_bytes(), b'broken')
        config = video.read(self.p / 'project.json')
        config['fps'] = 25
        video.write(self.p / 'project.json', config)
        changed = self.prepare()
        self.assertTrue(all(a['asset'] != b['asset'] for a, b in zip(first['clips'], changed['clips'])))
        # A different source at the same path must not reuse old cache entries.
        replacement = self.p / 'replacement.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(self.source), '-vf', 'hflip',
                        '-c:v', 'libx264', '-c:a', 'copy', str(replacement)], check=True)
        replacement.replace(self.source)
        final = self.prepare()
        self.assertNotEqual(changed['source_sha256'], final['source_sha256'])
        self.assertTrue(all(a['asset'] != b['asset'] for a, b in zip(changed['clips'], final['clips'])))

    def test_failure_never_publishes_a_completed_manifest(self):
        before = self.prepare()
        video.adjust_clip(self.args(clip_id='intro', start=.2, end=None))
        original_run = video.run
        def fail_encode(args, **kwargs):
            if str(args[0]) == 'ffmpeg':
                raise subprocess.CalledProcessError(1, args)
            return original_run(args, **kwargs)
        with patch.object(video, 'run', side_effect=fail_encode):
            with self.assertRaises(subprocess.CalledProcessError):
                self.prepare()
        self.assertEqual(before, video.read(self.p / 'edit/clips.json'))
        self.assertFalse(list((self.p / 'composition/assets/clips').glob('*.pending.mp4')))

    def test_hdr_requires_explicit_color_preparation(self):
        with patch.object(video, 'probe', return_value={'streams': [{'color_transfer': 'arib-std-b67'}]}):
            with self.assertRaisesRegex(ValueError, 'HDR'):
                self.prepare()
        self.assertFalse((self.p / 'edit/clips.json').exists())

    def test_idless_reimport_preserves_explicit_surviving_ids(self):
        ranges = [{k: v for k, v in r.items() if k != 'clip_id'} for r in self.ranges]
        self.import_ranges(ranges)
        timeline = video.read(self.p / 'edit/timeline.json')
        self.assertEqual([s['clip_id'] for s in timeline['spans']], ['intro', 'detail'])


if __name__ == '__main__':
    unittest.main()
