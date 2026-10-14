import importlib.util
from pathlib import Path
import math
import shutil
import struct
import subprocess
import tempfile
import unittest
import wave
import json

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('soundmap', ROOT/'scripts/soundmap.py')
soundmap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(soundmap)


class SoundMapTests(unittest.TestCase):
    def test_pcm_levels_and_leading_trailing_silence(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'audio.wav'
            samples = [0]*8000 + [int(12000*math.sin(2*math.pi*440*i/16000)) for i in range(8000)] + [0]*8000
            with wave.open(str(path),'wb') as f:
                f.setparams((1,2,16000,0,'NONE','not compressed'))
                f.writeframes(struct.pack('<'+'h'*len(samples),*samples))
            levels, duration = soundmap.levels_from_wav(path)
            self.assertEqual(duration,1.5)
            self.assertEqual(soundmap.quiet_intervals(levels,-35,.35),[(0,.5),(1,1.5)])

    def test_output_only_timestamps_rejected(self):
        with self.assertRaises(ValueError):
            soundmap.normalize_transcript({'segments':[{'start':1,'end':2,'text':'um'}]},3)
        entries, precision = soundmap.normalize_transcript({'segments':[{'start':1,'end':2,'text':'um'}]},3,'source')
        self.assertEqual(precision,'segment')
        self.assertEqual(entries[0]['source_start'],1)

    def test_invalid_intervals_rejected(self):
        for a,b in [(float('nan'),2),(-1,2),(2,1),(0,5),(True,2)]:
            with self.assertRaises(ValueError):
                soundmap.normalize_transcript({'words':[{'word':'uh','source_start':a,'source_end':b}]},3)

    def test_segment_filler_is_not_word_aligned(self):
        entries,_=soundmap.normalize_transcript({'segments':[{'source_start':1,'source_end':4,'text':'Ähm, eine Frage.'}]},5)
        candidate=soundmap.candidates([],entries)[0]
        self.assertEqual(candidate['precision'],'segment')
        self.assertEqual((candidate['source_start'],candidate['source_end']),(1,4))
        self.assertNotIn('possible_trim',candidate)

    def test_repetition_and_lexical_boundaries(self):
        entries,_=soundmap.normalize_transcript({'words':[{'word':x,'start':i,'end':i+.5} for i,x in enumerate(['human','ja','ja'])]},4,'source')
        result=soundmap.candidates([],entries)
        self.assertEqual([x['kind'] for x in result],['possible-repetition'])

    def test_cross_cut_and_removed_ranges(self):
        t={'spans':[dict(source_start=1,source_end=2,output_start=0,output_end=1),dict(source_start=3,source_end=4,output_start=1,output_end=2)]}
        self.assertEqual(soundmap.output_windows(1.5,3.5,t),[dict(start=.5,end=1),dict(start=1,end=1.5)])
        self.assertEqual(soundmap.output_windows(2,3,t),[])
        self.assertIsNone(soundmap.output_windows(2,3,None))

    def test_invalid_mapping_rejected(self):
        with self.assertRaises(ValueError):
            soundmap.validate_timeline(dict(source_duration=4,duration=2,spans=[dict(source_start=1,source_end=3,output_start=.5,output_end=2)]),4)

    @unittest.skipUnless(shutil.which('ffmpeg'),'FFmpeg required')
    def test_delayed_audio_stays_on_source_clock(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'delayed.mkv'; wav=Path(temp)/'analysis.wav'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=s=32x32:d=2:r=10','-itsoffset','0.5','-f','lavfi','-i','sine=frequency=440:sample_rate=16000:duration=1','-c:v','ffv1','-c:a','pcm_s16le',str(source)],check=True)
            soundmap.decode_source(source,wav)
            levels,_=soundmap.levels_from_wav(wav)
            quiet=soundmap.quiet_intervals(levels,-35,.35)
            self.assertAlmostEqual(quiet[0][0],0,places=2)
            self.assertAlmostEqual(quiet[0][1],.5,places=2)

    @unittest.skipUnless(shutil.which('ffmpeg'),'FFmpeg required')
    def test_cli_creates_report_without_changing_edit(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp);source=p/'original.wav'
            with wave.open(str(source),'wb') as f:
                f.setparams((1,2,16000,0,'NONE','not compressed'));f.writeframes(b'\0\0'*16000)
            (p/'project.json').write_text(json.dumps(dict(source=str(source))))
            (p/'transcript').mkdir()
            (p/'transcript/segments.json').write_text(json.dumps(dict(segments=[dict(source_start=.2,source_end=.8,text='ähm')])) )
            before=source.read_bytes()
            subprocess.run(['python3',str(ROOT/'scripts/video.py'),'soundmap',str(p)],check=True,capture_output=True)
            result=json.loads((p/'analysis/soundmap.json').read_text())
            self.assertEqual(result['transcript_granularity'],'segment')
            self.assertEqual({c['kind'] for c in result['candidates']},{'quiet','possible-filler'})
            self.assertEqual(source.read_bytes(),before)
            self.assertFalse((p/'edit').exists())
            self.assertTrue((p/'analysis/soundmap.md').exists())


if __name__ == '__main__':
    unittest.main()
