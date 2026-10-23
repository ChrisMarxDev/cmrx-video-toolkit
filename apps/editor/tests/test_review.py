import copy
import hashlib
import http.client
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import wave
import array

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import review
import server


def document():
    return dict(format='video-review', version=1, revision=0,
                source=dict(path='original.mp4', sha256='0'*64, duration=10, width=640, height=360),
                transcript=dict(time_base='source', granularity='segment', status='ready', segments=[dict(id='s0', text='Test speech', source_start=0, source_end=5)]), marks=[], objects=[])


def mark(kind, start, end, identifier='mark'):
    return dict(id=identifier, kind=kind, text='', source_start=start, source_end=end)


def obj(start, end, identifier='object'):
    return dict(id=identifier, text='Add a giraffe', source_start=start, source_end=end, rect=dict(x=.1,y=.2,width=.3,height=.4))


class ContractTests(unittest.TestCase):
    def test_missing_recognizer_fails_before_media_preparation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / 'input.mp4'
            source.write_bytes(b'synthetic source')
            doc = document()
            doc['source']['sha256'] = review.fingerprint(source)
            doc['transcript']['status'] = 'pending'
            review.write(root / 'review.json', doc)
            with patch.object(review.shutil, 'which', side_effect=lambda name: None if name == 'whisper-cli' else name), patch.object(review, 'run') as run:
                with patch.dict(review.os.environ, {'WHISPER_CLI': 'whisper-cli'}):
                    with self.assertRaisesRegex(ValueError, 'whisper.cpp'):
                        review.prepare(source, root)
                run.assert_not_called()
            self.assertEqual(source.read_bytes(), b'synthetic source')
            self.assertTrue((root / 'review.json').exists())

    def test_ranges_union_and_silence(self):
        doc=document();doc['marks']=[mark('bad',2,4),mark('bad',3,6,'other'),mark('comment',8,9,'note')]
        self.assertEqual(review.retained_ranges(doc),[dict(source_start=0,source_end=2),dict(source_start=6,source_end=10)])

    def test_overlapping_guidance_preserved(self):
        doc=document();doc['marks']=[mark('good',1,3),mark('bad',2,4,'other')]
        original=copy.deepcopy(doc)
        review.validate(doc)
        self.assertEqual(review.retained_ranges(doc),[dict(source_start=0,source_end=3),dict(source_start=4,source_end=10)])
        self.assertEqual(doc,original)
        doc['marks'].append(mark('good',3,5,'second-keep'))
        self.assertEqual(review.retained_ranges(doc),[dict(source_start=0,source_end=10)])

    def test_reject_malformed_ranges_rectangles_and_ids(self):
        for field,value in [('source_start',float('nan')),('source_end',11),('source_end',0)]:
            doc=document();doc['objects']=[obj(0,3)];doc['objects'][0][field]=value
            with self.assertRaises(ValueError):review.validate(doc)
        doc=document();doc['objects']=[obj(0,3)];doc['objects'][0]['rect']['width']=1
        with self.assertRaises(ValueError):review.validate(doc)
        doc=document();doc['objects']=[obj(0,3),obj(3,5)]
        with self.assertRaises(ValueError):review.validate(doc)

    def test_segment_precision_and_empty_transcript(self):
        raw={'transcription':[{'offsets':{'from':250,'to':10200},'text':' speech '}]}
        transcript=review.normalize_whisper(raw,10)
        self.assertEqual(transcript['segments'][0]['source_end'],10)
        self.assertEqual(transcript['granularity'],'segment')
        doc=document();doc['transcript']=review.normalize_whisper({'transcription':[]},10)
        review.validate(doc)

    def test_no_all_cut_export(self):
        doc=document();doc['marks']=[mark('bad',0,10)]
        with self.assertRaisesRegex(ValueError,'Every moment'):review.retained_ranges(doc)

    def test_atomic_write_round_trip_unicode(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'review.json';doc=document();doc['objects']=[obj(0,2)];doc['objects'][0]['text']='Giraffe — Größe 🦒'
            review.write(path,doc);self.assertEqual(review.validate(review.read(path)),doc)
            self.assertEqual(len(list(Path(temp).iterdir())),1)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.server=server.make_server(home=self.temp.name)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.port=self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.temp.cleanup()

    def request(self,path,body=None,headers=None,method=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.port,timeout=30)
        defaults={'X-Review-Token':self.server.token}
        if body is not None:defaults['Content-Type']='application/json';body=json.dumps(body)
        defaults.update(headers or {})
        conn.request(method or ('POST' if body is not None else 'GET'),path,body,defaults)
        response=conn.getresponse();data=response.read();status=response.status;response_headers=dict(response.getheaders());conn.close()
        return status,data,response_headers

    def test_token_origin_and_path_restriction(self):
        self.assertEqual(self.request('/api/state')[0],200)
        self.assertEqual(self.request('/api/state',headers={'X-Review-Token':'wrong'})[0],403)
        self.assertEqual(self.request('/api/cancel',{},headers={'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.request('/api/state',headers={'Host':'evil.example'})[0],403)
        self.assertEqual(self.request('/../review.py')[0],404)

    def test_save_reload_revision_and_immutable_source(self):
        state=self.server.session;state.workspace=Path(self.temp.name);state.document=document()
        payload=copy.deepcopy(state.document);payload['source_sha256']=state.document['source']['sha256'];payload['marks']=[mark('good',0,2)];payload['source']['path']='changed.mp4'
        status,data,_=self.request('/api/save',payload)
        self.assertEqual(status,200);self.assertEqual(json.loads(data)['revision'],1)
        saved=review.read(state.workspace/'review.json')
        self.assertEqual(saved['source']['path'],'original.mp4');self.assertEqual(saved['marks'],payload['marks'])
        self.assertEqual(self.request('/api/save',payload)[0],400)
        payload['revision']=1;payload['source_sha256']='f'*64
        self.assertEqual(self.request('/api/save',payload)[0],400)

    def test_model_default_is_used_and_remembered(self):
        state=self.server.session
        state.default_model='model chosen at startup.bin'
        state.default_language='de'
        with patch.object(review,'prepare',return_value=document()) as prepare:
            state.open({'path':str(Path(self.temp.name)/'video.mp4')})
            state.worker.join(2)
            self.assertFalse(state.job['busy'])
            self.assertIsNone(state.job['error'])
            self.assertEqual(prepare.call_args.args[2],'model chosen at startup.bin')
            self.assertEqual(prepare.call_args.kwargs['language'],'de')
        reopened=server.Session(self.temp.name)
        self.assertEqual(reopened.default_model,'model chosen at startup.bin')
        self.assertEqual(reopened.default_language,'de')
        with patch.object(review,'prepare',return_value=document()) as prepare:
            reopened.open({'path':str(Path(self.temp.name)/'video.mp4'), 'language':'en'})
            reopened.worker.join(2)
            self.assertEqual(prepare.call_args.kwargs['language'],'en')
        self.assertEqual(server.Session(self.temp.name).default_language,'en')

    def test_range_serving(self):
        state=self.server.session;state.workspace=Path(self.temp.name);(state.workspace/'source').mkdir()
        (state.workspace/'source/preview.mp4').write_bytes(b'0123456789')
        status,data,headers=self.request('/media',headers={'Range':'bytes=2-5'})
        self.assertEqual((status,data),(206,b'2345'));self.assertEqual(headers['Content-Range'],'bytes 2-5/10')
        self.assertEqual(self.request('/media',headers={'Range':'bytes=-3'})[1],b'789')
        self.assertEqual(self.request('/media',headers={'Range':'bytes=20-'})[0],416)

    def test_single_active_job_and_cancellation(self):
        entered=threading.Event()
        def work():entered.set();self.server.session.cancel.wait(3)
        self.server.session.start(work);entered.wait(1)
        with self.assertRaises(ValueError):self.server.session.start(work)
        self.assertEqual(self.request('/api/cancel',{})[0],200)
        for _ in range(50):
            if not self.server.session.snapshot()['job']['busy']:break
            time.sleep(.01)
        self.assertFalse(self.server.session.snapshot()['job']['busy'])


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'FFmpeg required')
class MediaFlowTests(unittest.TestCase):
    def test_delayed_audio_stays_on_source_clock(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);source=root/'delayed.mp4'
            subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','color=s=160x90:r=30:d=3','-itsoffset','1','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-c:a','aac',str(source)],check=True)
            raw=root/'empty.json';review.write(raw,{'transcription':[]})
            review.prepare(source,root/'review',transcript=raw)
            with wave.open(str(root/'review/source/transcription.wav')) as audio:
                samples=array.array('h',audio.readframes(audio.getnframes()));rate=audio.getframerate()
            self.assertLess(max(abs(n) for n in samples[:int(rate*.5)]),10)
            self.assertGreater(max(abs(n) for n in samples[int(rate*1.2):int(rate*1.5)]),1000)

    def test_two_videos_round_trip_export_and_legacy(self):
        with tempfile.TemporaryDirectory(prefix='video review ') as temp:
            root=Path(temp)
            for index,size in enumerate(['320x180','180x320']):
                source=root/f'original Größe {index}.mp4';workspace=root/f'workspace {index}'
                subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i',f'color=c=blue:s={size}:r=30:d=4','-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',str(source)],check=True)
                before=review.fingerprint(source)
                raw=root/f'transcript{index}.json';review.write(raw,{'transcription':[{'offsets':{'from':0,'to':2000},'text':'Synthetic first segment'},{'offsets':{'from':2000,'to':4000},'text':'Synthetic second segment'}]})
                doc=review.prepare(source,workspace,transcript=raw)
                self.assertEqual(doc['transcript']['status'],'ready');self.assertTrue((workspace/'source/audio.wav').is_file())
                doc['marks']=[mark('good',0,.5),mark('bad',1,2,'cut'),mark('comment',2,3,'comment')]
                doc['objects']=[obj(.5,2.5),obj(1.2,1.8,'removed')]
                review.write(workspace/'review.json',doc)
                reopened=review.prepare(source,workspace)
                self.assertEqual(doc,reopened)
                target=Path(review.export(reopened,workspace,render=True))
                timeline=review.read(target/'edit/timeline.json')
                self.assertAlmostEqual(timeline['duration'],doc['source']['duration']-1)
                notes=review.read(target/'storyboard/annotations.resolved.json')['notes']
                crossing=next(n for n in notes if n['id']=='object');removed=next(n for n in notes if n['id']=='removed')
                self.assertEqual(len(crossing['windows']),2);self.assertEqual(removed['status'],'removed-by-edit');self.assertEqual(removed['windows'],[])
                self.assertEqual(crossing['rect'],doc['objects'][0]['rect']);self.assertEqual(crossing['placement'],'approximate')
                self.assertTrue((target/'edit/narration.wav').is_file());self.assertEqual(before,review.fingerprint(source))
                with self.assertRaises(ValueError):review.prepare(root/f'original Größe {1-index}.mp4' if index else raw,workspace)
            legacy=root/'legacy';legacy.mkdir();review.write(legacy/'project.json',{'source':str(source),'source_duration':4})
            shutil.copyfile(raw,legacy/'transcript.json');review.write(legacy/'session.json',{'removed':[0],'notes':[dict(id='note',source_start=2,source_end=3,intent='Old comment')]})
            migrated=review.prepare(source,legacy)
            self.assertEqual([m['kind'] for m in migrated['marks']],['bad','comment'])
            self.assertTrue((legacy/'session.json').exists())


if __name__=='__main__':unittest.main()
