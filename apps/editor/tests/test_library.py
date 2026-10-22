import copy
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
import review
from test_review import document


class LibraryTests(unittest.TestCase):
    def test_discovery_reuses_review_and_excludes_generated_or_external_media(self):
        with tempfile.TemporaryDirectory() as folder, tempfile.TemporaryDirectory() as outside:
            root = Path(folder).resolve()
            home = root / '.video-reviews/new-session'
            state = server.Session(home, library_root=root)
            original = root / '.video-reviews/old-session/project/original/lesson_1.mov'
            original.parent.mkdir(parents=True)
            original.write_bytes(b'fixture')
            workspace = original.parent.parent
            doc = copy.deepcopy(document())
            doc['source']['path'] = 'original/lesson_1.mov'
            review.write(workspace / 'review.json', doc)
            for path in [root/'videos/lesson_2.mp4', root/'videos/renders/final.mp4', root/'videos/composition/assets/rough.mp4']:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b'fixture')
            external = Path(outside) / 'private.mp4'
            external.write_bytes(b'fixture')
            (root/'videos/escape.mp4').symlink_to(external)
            bad = copy.deepcopy(doc)
            bad['source']['path'] = str(external)
            review.write(root/'.video-reviews/external/review.json', bad)
            entries = state.library()
            self.assertEqual({x['name'] for x in entries}, {'lesson_1', 'lesson_2'})
            saved = next(x for x in entries if x['name'] == 'lesson_1')
            self.assertEqual(saved['path'], str(workspace/'review.json'))
            with patch.object(state, 'open') as opened:
                state.select(saved['id'])
                opened.assert_called_once_with(dict(path=str(workspace/'review.json'), workspace=str(workspace)))
            original.unlink()
            with self.assertRaisesRegex(ValueError, 'no longer available'):
                state.select(saved['id'])
            with self.assertRaises(ValueError):
                state.select('../private.mp4')

    def test_unprepared_uploads_are_available_in_a_later_session(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve()
            original = root/'.video-reviews/previous/upload/original/new.mov'
            original.parent.mkdir(parents=True)
            original.write_bytes(b'fixture')
            state = server.Session(root/'.video-reviews/current', library_root=root)
            entries = state.library()
            self.assertEqual(len(entries), 1)
            self.assertFalse(entries[0]['prepared'])


if __name__ == '__main__':
    unittest.main()
