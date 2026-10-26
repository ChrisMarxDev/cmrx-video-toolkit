import io
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import meshy
import scene_capture


def fixture_glb(path):
    """Original synthetic triangle skinned to one animated joint, no external assets."""
    binary = bytearray()
    views, accessors = [], []

    def accessor(values, fmt, component, shape, count, **extra):
        while len(binary) % 4:
            binary.append(0)
        start = len(binary)
        binary.extend(struct.pack('<' + fmt, *values))
        views.append({'buffer': 0, 'byteOffset': start, 'byteLength': len(binary) - start})
        accessors.append({'bufferView': len(views) - 1, 'componentType': component,
                          'type': shape, 'count': count, **extra})
        return len(accessors) - 1

    pos = accessor([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0], '9f', 5126, 'VEC3', 3,
                   min=[-0.5, 0, 0], max=[0.5, 1, 0])
    normal = accessor([0, 0, 1] * 3, '9f', 5126, 'VEC3', 3)
    joints = accessor([0] * 12, '12H', 5123, 'VEC4', 3)
    weights = accessor([1, 0, 0, 0] * 3, '12f', 5126, 'VEC4', 3)
    times = accessor([0, 1], '2f', 5126, 'SCALAR', 2, min=[0], max=[1])
    motion = accessor([0, 0, 0, 0.5, 0, 0], '6f', 5126, 'VEC3', 2)
    doc = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0, 1]}],
           'nodes': [{'mesh': 0, 'skin': 0}, {'name': 'joint'}],
           'skins': [{'joints': [1], 'skeleton': 1}],
           'meshes': [{'primitives': [{'attributes': {'POSITION': pos, 'NORMAL': normal,
                                                     'JOINTS_0': joints, 'WEIGHTS_0': weights},
                                      'material': 0}]}],
           'materials': [{'doubleSided': True, 'pbrMetallicRoughness': {
               'baseColorFactor': [0.8, 0.3, 0.15, 1], 'metallicFactor': 0}}],
           'animations': [{'name': 'slide', 'samplers': [{'input': times, 'output': motion}],
                           'channels': [{'sampler': 0, 'target': {'node': 1, 'path': 'translation'}}]}],
           'buffers': [{'byteLength': len(binary)}], 'bufferViews': views, 'accessors': accessors}
    js = json.dumps(doc).encode()
    js += b' ' * (-len(js) % 4)
    binary += b'\x00' * (-len(binary) % 4)
    body = struct.pack('<II', len(js), 0x4E4F534A) + js
    body += struct.pack('<II', len(binary), 0x004E4942) + binary
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, len(body) + 12) + body)


class HelpersTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.receipt = self.root / 'job.json'
        self.model = self.root / 'model.glb'
        fixture_glb(self.model)

    def accepted(self):
        meshy.save(self.receipt, {'kind': 'rigging', 'task_id': 'a/b', 'submission': 'accepted'})

    def test_inventory_and_truncation(self):
        info = scene_capture.inspect_glb(self.model)
        self.assertEqual((info['meshes'], info['skins']), (1, 1))
        self.assertEqual(info['animations'][0]['name'], 'slide')
        self.model.write_bytes(self.model.read_bytes()[:-4])
        with self.assertRaisesRegex(ValueError, 'complete GLB'):
            scene_capture.inspect_glb(self.model)

    @patch.dict(os.environ, {'MESHY_API_KEY': 'secret-test'})
    def test_submit_once_and_resume(self):
        with patch.object(meshy, 'request', return_value={'result': 'task-1'}) as request:
            meshy.submit('rigging', {'input_task_id': 'model-1'}, self.receipt)
            with self.assertRaises(FileExistsError):
                meshy.submit('rigging', {'input_task_id': 'model-1'}, self.receipt)
        self.assertEqual(request.call_count, 1)
        self.assertNotIn('secret-test', self.receipt.read_text())
        self.assertEqual(self.receipt.stat().st_mode & 0o777, 0o600)

    @patch.dict(os.environ, {'MESHY_API_KEY': 'secret-test'})
    def test_ambiguous_submission_is_reserved(self):
        with patch.object(meshy, 'request', side_effect=RuntimeError('lost response')):
            with self.assertRaises(RuntimeError):
                meshy.submit('rigging', {'input_task_id': 'model-1'}, self.receipt)
        self.assertEqual(json.loads(self.receipt.read_text())['submission'], 'unknown')
        with self.assertRaisesRegex(ValueError, 'reconcile'):
            meshy.refresh(self.receipt)

    def test_poll_exit_states_and_encoded_id(self):
        self.accepted()
        for status, code in [('PENDING', 2), ('FAILED', 1), ('SUCCEEDED', 0)]:
            with patch.object(meshy, 'request', return_value={'status': status}) as request:
                self.assertEqual(meshy.poll(self.receipt), code)
                request.assert_called_once_with('/openapi/v1/rigging/a%2Fb')

    def test_download_refreshes_without_api_header(self):
        self.accepted()
        task = {'status': 'SUCCEEDED', 'result': {'rigged_character_glb_url': 'https://cdn.example/model'}}
        opener = Mock()
        opener.open.return_value = io.BytesIO(self.model.read_bytes())
        with patch.object(meshy, 'request', return_value=task), patch.object(meshy, 'build_opener', return_value=opener):
            out = self.root / 'download.glb'
            meshy.download(self.receipt, 'result.rigged_character_glb_url', out)
            self.assertEqual(out.read_bytes(), self.model.read_bytes())
            opener.open.assert_called_once_with('https://cdn.example/model', timeout=60)

    def test_bad_download_not_published(self):
        self.accepted()
        task = {'status': 'SUCCEEDED', 'model_urls': {'glb': 'https://cdn.example/model'}}
        opener = Mock()
        opener.open.return_value = io.BytesIO(b'<html>error</html>')
        with patch.object(meshy, 'request', return_value=task), patch.object(meshy, 'build_opener', return_value=opener):
            out = self.root / 'download.glb'
            with self.assertRaises(ValueError):
                meshy.download(self.receipt, 'model_urls.glb', out)
            self.assertFalse(out.exists())
            self.assertFalse(out.with_suffix('.glb.part').exists())

    def test_foreign_partial_file_is_preserved(self):
        self.accepted()
        task = {'status': 'SUCCEEDED', 'model_urls': {'glb': 'https://cdn.example/model'}}
        out = self.root / 'download.glb'
        part = out.with_suffix('.glb.part')
        part.write_bytes(b'owned by another process')
        with patch.object(meshy, 'request', return_value=task):
            with self.assertRaises(FileExistsError):
                meshy.download(self.receipt, 'model_urls.glb', out)
        self.assertEqual(part.read_bytes(), b'owned by another process')

    def test_corrupt_chunk_size_is_rejected(self):
        data = bytearray(self.model.read_bytes())
        json_length = struct.unpack_from('<I', data, 12)[0]
        struct.pack_into('<I', data, 20 + json_length, len(data) * 2)
        self.model.write_bytes(data)
        with self.assertRaisesRegex(ValueError, 'chunk length'):
            scene_capture.inspect_glb(self.model)

    def test_incomplete_frames_never_encode(self):
        (self.root / 'complete.json').write_text(json.dumps({'frames': 2, 'fps': 30}))
        (self.root / 'frame-000000.png').write_bytes(b'png')
        with patch.object(scene_capture.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'sequence'):
                scene_capture.encode(self.root, self.root / 'video.mov')
            run.assert_not_called()

    def test_scaffold_rejects_git_worktree(self):
        with patch.object(scene_capture.subprocess, 'run', return_value=Mock(returncode=0)):
            with self.assertRaisesRegex(ValueError, 'outside Git'):
                scene_capture.scaffold(self.model, self.root / 'app', 'linux')
        self.assertFalse((self.root / 'app').exists())


if __name__ == '__main__':
    unittest.main()
