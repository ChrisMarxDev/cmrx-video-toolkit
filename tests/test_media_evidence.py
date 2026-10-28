"""Synthetic evidence contracts, actual FFmpeg artifacts, and optional model acceptance."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from tools.media_evidence import common, quality, previews, receipts, speech, map_words
from scripts import video


class ContractTests(unittest.TestCase):
    def test_metrics_distinguish_silence_from_unavailable_and_parse_peak(self):
        r = quality.parse_metrics('black_start:0 black_end:0.4\nsilence_start: -0.1\nsilence_end: 0.8\nsilence_start: 1.5\nSummary:\nI: -21.7 LUFS\nPeak: -2.1 dBFS',2)
        self.assertEqual(r['silence'],[dict(start=0,end=.8),dict(start=1.5,end=2)])
        self.assertEqual(r['integrated_lufs'],-21.7); self.assertEqual(r['true_peak_dbtp'],-2.1)
        self.assertIsNone(quality.parse_metrics('Summary:\nI: -70.0 LUFS\nPeak: -inf dBFS',2)['integrated_lufs'])

    def test_no_invented_timing_for_unsupported_words(self):
        class Backend:
            vocab={'A':1,'|':2,'<pad>':0}
            def emissions(self, samples):
                raise AssertionError('Unsupported text must not reach inference')
        result=speech.align_segment(dict(id='s',start=0,end=1,text='123'),[],Backend(),.15)
        self.assertEqual(result[0]['status'],'unsupported_text'); self.assertIsNone(result[0]['source_start'])
        for t in [dict(time_base='output',segments=[]),dict(time_base='source',segments=[dict(source_start=0,source_end=31,text='test')])]:
            with self.assertRaises(ValueError): speech.segments(t,40)

    def test_mapping_does_not_guess_partial_or_low_confidence_words(self):
        report=dict(source={'sha256':'x'},words=[
            dict(id='a',text='whole',source_start=1.2,source_end=1.4,status='aligned'),
            dict(id='b',text='partial',source_start=1.8,source_end=2.2,status='aligned'),
            dict(id='c',text='uncertain',source_start=1.5,source_end=1.6,status='low_confidence')])
        t=video.import_cut(dict(version=2,retainedRanges=[dict(source_start=1,source_end=2)]),3)
        r=map_words.map_words(report,t)
        self.assertAlmostEqual(r['words'][0]['start'],.2)
        self.assertEqual([x['reason'] for x in r['excluded']],['partial_word','low_confidence'])
        self.assertIn('00:00:00,200 --> 00:00:00,400',map_words.srt(r['words']))

    def test_publish_failure_never_overwrites_previous_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'out'
            with self.assertRaises(RuntimeError):
                with common.output_directory(p) as stage:
                    (stage/'report').write_text('partial'); raise RuntimeError('fail')
            self.assertFalse(p.exists())
            p.mkdir(); (p/'keep').write_text('existing')
            with self.assertRaises(ValueError):
                with common.output_directory(p): pass
            self.assertEqual((p/'keep').read_text(),'existing')


@unittest.skipUnless(importlib.util.find_spec('numpy'), 'Optional NumPy environment')
class CTCTests(unittest.TestCase):
    def test_repeated_letters_need_blank_and_impossible_path_is_explicit(self):
        import numpy as np
        from tools.media_evidence.ctc import align
        logits=np.full((5,3),-12.); logits[range(5),[0,1,0,1,0]]=12
        r=align(logits,[1,1]); self.assertEqual([(x['start'],x['end']) for x in r],[(1,2),(3,4)])
        self.assertIsNone(align(np.array([[0.,4.]]),[1,1]))
        with self.assertRaises(ValueError): align(np.array([[0.,float('nan')]]),[1])


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'FFmpeg required')
class MediaTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.root=Path(self.tmp.name)
        self.media=self.root/'source.mp4'
        common.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=25:d=3',
                    '-f','lavfi','-i','sine=frequency=400:sample_rate=48000:duration=3',
                    '-c:v','libx264','-threads','1','-c:a','aac','-shortest',self.media])
        self.source=common.identity(self.media)
        self.timeline=video.import_cut(dict(version=2,retainedRanges=[dict(clip_id='a',source_start=0,source_end=1),dict(clip_id='b',source_start=2,source_end=3)]),3)
        self.timeline_path=self.root/'timeline.json'; common.write(self.timeline_path,self.timeline)

    def evidence(self):
        return dict(format='speech-evidence',version=1,time_base='source',source=self.source,
                    words=[dict(id='w',text='crossed',source_start=.9,source_end=1.1,confidence=.9,status='aligned')],
                    activity=[dict(source_start=0,source_end=3,probability=.9)])

    def test_cut_facts_detect_intersections_without_applying_edits(self):
        before=common.sha(self.timeline_path)
        r=quality.cut_facts(self.source,self.timeline,self.evidence())
        self.assertEqual(r['cuts'][0]['words'][0]['text'],'crossed')
        self.assertIn('word_intersection',r['cuts'][0]['review_flags'])
        self.assertEqual(r['cuts'][0]['output_time'],1)
        self.assertEqual(common.sha(self.timeline_path),before)
        bad=self.evidence(); bad['source']={**self.source,'sha256':'other'}
        with self.assertRaisesRegex(ValueError,'different source'): quality.cut_facts(self.source,self.timeline,bad)
        bad=self.evidence(); bad['activity'][0]['probability']=float('nan')
        with self.assertRaises(ValueError): quality.cut_facts(self.source,self.timeline,bad)
        self.assertIsNone(quality.cut_facts(self.source,self.timeline)['cuts'][0]['speech_probability']['out'])

    def test_preview_contains_both_retained_sides_and_contact_sheet(self):
        out=self.root/'previews'; out.mkdir()
        windows=previews.select_ranges(self.timeline,cuts=[1],radius=.25)
        r=previews.build(self.source,self.timeline,windows,out)
        item=r['artifacts'][0]
        self.assertEqual(r['mode'],'source-cut-diagnostic')
        self.assertEqual([(p['source_start'],p['source_end']) for p in item['source_parts']],[(.75,1),(2,2.25)])
        self.assertTrue((out/item['contact_sheet']).is_file())
        self.assertAlmostEqual(common.identity(out/item['media'])['duration'],.5,delta=.1)
        # Confirm the selected source picture, rather than just file existence.
        def pixels(path,at):
            return common.run(['ffmpeg','-v','error','-i',path,'-ss',str(at),'-frames:v','1','-vf','scale=16:9','-f','rawvideo','-pix_fmt','rgb24','-']).stdout
        reference=pixels(self.media,2.1); sampled=pixels(out/item['media'],.35)
        self.assertEqual(len(reference),len(sampled))
        self.assertLess(sum(abs(a-b) for a,b in zip(reference,sampled))/len(reference),12)
        for args in [dict(clips=['missing']),dict(cuts=[0]),dict(ranges=[(0,float('nan'))])]:
            with self.assertRaises(ValueError): previews.select_ranges(self.timeline,**args)

    def test_actual_silence_black_and_nonfinite_inputs(self):
        media=self.root/'silent.mp4'
        common.run(['ffmpeg','-v','error','-f','lavfi','-i','color=black:s=160x90:r=25:d=1',
                    '-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t','1','-c:v','libx264','-threads','1','-c:a','aac',media])
        r=quality.measure(media)
        self.assertTrue(r['black']); self.assertTrue(r['silence']); self.assertIsNone(r['integrated_lufs'])
        self.assertIsNone(r['true_peak_dbtp'])
        with self.assertRaises(ValueError): quality.measure(media,minimum=float('nan'))
        r=quality.measure(self.media); self.assertIsNotNone(r['integrated_lufs']); self.assertIsNotNone(r['true_peak_dbtp'])

    def test_receipt_detects_changed_custom_component_media_and_timeline(self):
        comp=self.root/'composition'; (comp/'lib').mkdir(parents=True)
        (comp/'pubspec.yaml').write_text('name: fixture\n'); (comp/'lib/main.dart').write_text('// authored scene')
        custom=self.root/'custom'; (custom/'lib').mkdir(parents=True); (custom/'lib/custom.dart').write_text('// custom widget')
        (comp/'.dart_tool').mkdir()
        common.write(comp/'.dart_tool/package_config.json',dict(packages=[dict(name='custom',rootUri=custom.as_uri())]))
        render=self.root/'render.mp4'
        previews.excerpt(self.media,[(0,1),(2,3)],render)
        receipt=self.root/'receipt.json'
        before=receipts.composition_identity(comp)
        receipts.create(render,comp,self.timeline,before,receipt,self.source['sha256'])
        out=self.root/'composed'; out.mkdir()
        r=previews.build(self.source,self.timeline,previews.select_ranges(self.timeline,cuts=[1]),out,render,receipt,comp)
        self.assertEqual(r['mode'],'composed-render')
        external=self.root/'outside-font.bin'; external.write_bytes(b'font-one')
        common.write(comp/'fluvie.json',dict(evidenceInputs=[str(external)]))
        before=receipts.composition_identity(comp)
        receipts.create(render,comp,self.timeline,before,receipt,self.source['sha256'])
        external.write_bytes(b'font-two')
        with self.assertRaisesRegex(ValueError,'custom-component'): receipts.verify(receipt,render,comp,self.timeline)
        external.write_bytes(b'font-one')
        (custom/'lib/custom.dart').write_text('// changed custom widget')
        with self.assertRaisesRegex(ValueError,'custom-component'): receipts.verify(receipt,render,comp,self.timeline)
        with self.assertRaisesRegex(ValueError,'changed while rendering'): receipts.create(render,comp,self.timeline,before,receipt,self.source['sha256'])
        (custom/'lib/custom.dart').write_text('// custom widget')
        t={**self.timeline,'revision':'new'}
        with self.assertRaisesRegex(ValueError,'stale'): receipts.verify(receipt,render,comp,t)
        with render.open('ab') as f:f.write(b'changed')
        with self.assertRaisesRegex(ValueError,'stale'): receipts.verify(receipt,render,comp,self.timeline)

    def test_pipeline_qa_preserves_mechanical_report_when_measurements_fail(self):
        from types import SimpleNamespace
        (self.root/'edit').mkdir(); (self.root/'review').mkdir()
        common.write(self.root/'project.json',dict(source=str(self.media),fps=25,width=160,height=90))
        t=video.import_cut(dict(version=2,retainedRanges=[dict(source_start=0,source_end=3)]),3)
        common.write(self.root/'edit/timeline.json',t)
        with patch('tools.media_evidence.quality.measure',side_effect=ValueError('filter unavailable')):
            video.qa(SimpleNamespace(project=str(self.root),file=str(self.media),draft=False))
        report=common.read(self.root/'review/media-check.json')
        self.assertTrue(report['passed'])
        self.assertIsNone(report['measurements'])
        self.assertIn('unavailable',report['measurement_error'])
        self.assertIn('audio/black/silence measurements unavailable',report['manual_checks_pending'])

    def test_invalid_timeline_and_no_audio_are_explicit(self):
        t={**self.timeline,'duration':float('nan')}; common.write(self.timeline_path,self.timeline)
        with self.assertRaises(ValueError): common.write(self.root/'bad.json',t)
        t=json.loads(json.dumps(self.timeline));t['spans'][1]['output_start']=1.2;common.write(self.timeline_path,t)
        with self.assertRaises(ValueError):common.timeline_document(self.timeline_path,self.source)
        silent=self.root/'video-only.mp4'
        common.run(['ffmpeg','-v','error','-i',self.media,'-an','-c:v','copy',silent])
        r=quality.measure(silent);self.assertIsNone(r['silence']);self.assertIsNone(r['integrated_lufs'])


@unittest.skipUnless(os.environ.get('EVIDENCE_MODELS') and shutil.which('espeak-ng'), 'Optional real speech model acceptance')
class SpeechModelTests(unittest.TestCase):
    def test_real_alignment_speech_and_silence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); wav=root/'speech.wav'
            text='Hello world. This is a synthetic test of precise speech timing.'
            common.run(['espeak-ng','-w',wav,text]); source=common.identity(wav)
            transcript=root/'transcript.json'
            common.write(transcript,dict(time_base='source',segments=[dict(id='s',source_start=0,source_end=source['duration'],text=text)]))
            b=speech.OnnxSpeech(os.environ['EVIDENCE_MODELS'])
            report=speech.analyze(source,transcript,b)
            speech.validate_evidence(report,source)
            self.assertEqual(len(report['words']),11)
            self.assertGreaterEqual(sum(w['status']=='aligned' for w in report['words']),9)
            self.assertTrue(report['speech'])
            self.assertLess(report['words'][0]['source_start'],.3)
            self.assertGreater(report['words'][-1]['source_end'],3)
            silent=root/'silent.wav'
            common.run(['ffmpeg','-v','error','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','2',silent])
            self.assertFalse(speech.speech_intervals(b.activity(str(silent),2)))
