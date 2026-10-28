"""Regression coverage for cut remapping, project configuration and honest QA."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from scripts import video


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.p = Path(self.temp.name)
        video.write(self.p / 'project.json', dict(source=str(self.p / 'source.mp4'), fps=30))
        video.write(self.p / 'annotations.json', dict(version=1, notes=[]))

    def test_adjust_rebuilds_words_captions_and_partial_cues(self):
        data = dict(version=1, videoPath=str(self.p / 'source.mp4'), words=[
            dict(word='first', start=.2, end=.5), dict(word='second', start=1, end=1.5)])
        timeline = video.import_cut(data, 3)
        video.write(self.p / 'edit/decisions.json', data)
        video.write(self.p / 'edit/timeline.json', timeline)
        video.write(self.p / 'transcript/segments.json', dict(segments=[
            dict(id='s', text='second', source_start=1, source_end=1.5)]))
        args = SimpleNamespace(project=str(self.p), clip_id=timeline['spans'][0]['clip_id'], start=0, end=None)
        with patch.object(video, 'probe', return_value={'format': {'duration': '3'}}):
            video.adjust_clip(args)
            updated = video.read(self.p / 'edit/timeline.json')
            self.assertEqual(len(updated['words']), 2)
            self.assertEqual(updated['words'][1]['start'], 1)
            self.assertIn('00:00:01,000', (self.p / 'transcript/output.srt').read_text())
            self.assertEqual(video.read(self.p / 'transcript/output-segments.json')['timeline_revision'], updated['revision'])
            args.end = 1.2
            video.adjust_clip(args)
        updated = video.read(self.p / 'edit/timeline.json')
        self.assertEqual(len(updated['words']), 1)
        self.assertEqual(updated['partial_word_ids'], ['w000001'])
        self.assertEqual((self.p / 'transcript/output.srt').read_text(), '')
        self.assertEqual(video.read(self.p / 'transcript/output-segments.json')['status'], 'needs-caption-review')

    def test_configured_scaffold_preserves_manifest_and_custom_entries(self):
        config = video.read(self.p / 'project.json')
        config['composition_project'] = 'fluvie'
        video.write(self.p / 'project.json', config)
        composition = self.p / 'fluvie'
        composition.mkdir()
        pubspec = composition / 'pubspec.yaml'
        original = 'name: custom\nflutter:\n  shaders:\n    - shaders/a.frag\n'
        pubspec.write_text(original)
        video.write(composition / 'fluvie.json', dict(path='lib/scenes/video.dart', entry='film', draftEntry='draft'))
        video.write(self.p / 'edit/timeline.json', dict(revision='r', duration=2))
        with patch.object(video, 'checked_clips', return_value={'clips': []}):
            video.compose(SimpleNamespace(project=str(self.p), replace=False))
        self.assertEqual(pubspec.read_text(), original)
        source = (composition / 'lib/scenes/video.dart').read_text()
        self.assertIn('Video film()', source)
        self.assertIn("import '../source_clips.dart'", source)

    def test_project_runtime_overrides_environment(self):
        from scripts.fluvie_project import settings
        video.write(self.p / 'fluvie.json', dict(executable='./bin/fluvie', path='lib/video.dart'))
        with patch.dict('os.environ', FLUVIE_BIN='wrong-fluvie'):
            self.assertEqual(settings(self.p)['executable'], str(self.p / 'bin/fluvie'))
        video.write(self.p / 'fluvie.json', dict(path='../escape.dart'))
        with self.assertRaises(ValueError):
            settings(self.p)

    def test_render_uses_configured_runtime_and_stops_on_invalid_source(self):
        composition = self.p / 'composition'
        video.write(composition / 'fluvie.json', dict(path='lib/video.dart', entry='film', draftEntry='draft', executable='/custom/fluvie'))
        video.write(self.p / 'edit/timeline.json', dict(revision='r', duration=1))
        clips = {'clips': []}
        video.write(composition / 'manifest.json', dict(timeline_revision='r', media_mode='clips', clips_digest=video.digest(clips)))
        (composition / 'pubspec.yaml').write_text('name: fixture\n')
        (self.p / 'source.mp4').write_bytes(b'synthetic source identity')
        args = SimpleNamespace(project=str(self.p), command='render', final=False, approved=False)
        with patch.object(video, 'checked_clips', return_value=clips), patch.object(video, 'validate', return_value={'ok': False}), patch.object(video, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'Static validation'):
                video.fluvie(args)
            run.assert_not_called()
        with patch.object(video, 'checked_clips', return_value=clips), patch.object(video, 'validate', return_value={'ok': True}) as validate, patch.object(video.shutil, 'disk_usage', return_value=SimpleNamespace(free=10**12)), patch.object(video, 'run') as run, patch('tools.media_evidence.receipts.create') as receipt:
            video.fluvie(args)
            command = run.call_args.args[0]
            receipt.assert_called_once()
            self.assertEqual(receipt.call_args.args[4], self.p / 'renders/draft.receipt.json')
            self.assertEqual(command[0], '/custom/fluvie')
            self.assertEqual(command[2], str(composition / 'lib/video.dart'))
            self.assertEqual(command[command.index('--entry') + 1], 'draft')
            self.assertEqual(validate.call_args.kwargs['fluvie_bin'], '/custom/fluvie')
