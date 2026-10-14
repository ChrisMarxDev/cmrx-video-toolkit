import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from video_tools.__main__ import dimensions, gradient, read_frame, validate_output
import io


class VideoToolsTests(unittest.TestCase):
    def test_geometry_validation(self):
        self.assertEqual(dimensions('468:468:36:204',4),(468,468,36,204))
        for value in ['0:10','-2:4','3:4','a:b','2:4:6']:
            with self.assertRaises(ValueError):dimensions(value,2)

    def test_no_original_or_previous_output_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'video.mp4';p.write_bytes(b'original')
            with self.assertRaises(ValueError):validate_output(p,p)
            q=Path(temp)/'previous.mp4';q.write_bytes(b'previous')
            with self.assertRaises(ValueError):validate_output(p,q)
            self.assertEqual(p.read_bytes(),b'original')

    def test_frame_reader_rejects_truncation(self):
        self.assertEqual(read_frame(io.BytesIO(b'abc'),3),b'abc')
        self.assertEqual(read_frame(io.BytesIO(b''),3),b'')
        with self.assertRaises(ValueError):read_frame(io.BytesIO(b'ab'),3)

    def test_gradient_is_deterministic(self):
        with tempfile.TemporaryDirectory() as temp:
            a=Path(temp)/'a.ppm';b=Path(temp)/'b.ppm'
            gradient(a,16,24);gradient(b,16,24)
            self.assertEqual(a.read_bytes(),b.read_bytes())
            self.assertEqual(len(a.read_bytes()),len(b'P6\n16 24\n255\n')+16*24*3)

    @unittest.skipUnless(shutil.which('ffmpeg'),'FFmpeg required')
    def test_reframe_preserves_audio_and_duration(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp);src=p/'source.mp4';out=p/'portrait.mp4'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=s=160x100:r=30:d=1','-f','lavfi','-i','sine=frequency=440:duration=1.2','-c:v','libx264','-c:a','aac',str(src)],check=True)
            subprocess.run(['python3','-m','video_tools','reframe',str(src),str(out),'--canvas','180:320','--box','160:100:10:80'],check=True,capture_output=True)
            def audio_hash(path):return subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-map','0:a','-c:a','copy','-f','hash','-'],text=True)
            self.assertEqual(audio_hash(src),audio_hash(out))
            info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out)]))
            v=next(s for s in info['streams'] if s['codec_type']=='video')
            self.assertEqual((v['width'],v['height']),(180,320))
            self.assertLess(abs(float(info['format']['duration'])-1.2),.1)
            self.assertTrue(out.with_suffix('.mp4.json').exists())
