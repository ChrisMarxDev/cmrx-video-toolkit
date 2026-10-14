#!/usr/bin/env python3
"""Two narrated videos through real local transcription, HTTP review and export.

Needs FFmpeg/ffprobe, espeak-ng, whisper-cli (or WHISPER_CLI), and --model.
No browser automation. All retained evidence is synthetic and local.
"""
import argparse
import copy
import http.client
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import urllib.parse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import review
import server


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model',required=True)
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    root=Path(args.output).resolve();root.mkdir(parents=True,exist_ok=True)
    app=server.make_server(home=root/'picked-videos')
    thread=threading.Thread(target=app.serve_forever,daemon=True);thread.start()
    port=app.server_address[1]
    evidence=[]

    def request(route,data=None,raw=None,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',port,timeout=60)
        h={'X-Review-Token':app.token,'Content-Type':'application/json'}
        h.update(headers or {})
        body=raw if raw is not None else json.dumps(data) if data is not None else None
        conn.request('POST' if body is not None else 'GET',route,body,h)
        response=conn.getresponse();payload=response.read();conn.close()
        assert response.status==200,(response.status,payload.decode(errors='replace'))
        return json.loads(payload)

    def wait():
        deadline=time.monotonic()+300
        while time.monotonic()<deadline:
            state=request('/api/state')
            if not state['job']['busy']:
                assert not state['job']['error'],state['job']['error']
                return state
            time.sleep(.2)
        raise AssertionError('Processing did not finish in five minutes')

    try:
        for index,(size,text,extension) in enumerate([
            ('640x360','Welcome to the garden. This is the good explanation that we want to keep. The next part is a mistake. Please add a giraffe beside the tree. Thank you for watching this example.','mp4'),
            ('360x640','Today we are testing a vertical video. Keep the introduction and remove the mistake in the middle. Add a colorful diagram near the top of the screen. This is the final explanation.','mkv')]):
            print(f'Video {index+1}: generating {size} narrated fixture',flush=True)
            audio=root/f'narration-{index}.wav';source=root/f'original {index}.{extension}'
            subprocess.run(['espeak-ng','-s','145','-v','en-us','-w',str(audio),text],check=True)
            subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i',f'testsrc2=size={size}:rate=30','-i',str(audio),'-c:v','libx264','-preset','fast','-pix_fmt','yuv420p','-c:a','aac','-shortest',str(source)],check=True)
            original_hash=review.fingerprint(source)
            if index==0:
                workspace=root/'cli-review'
                subprocess.run([sys.executable,str(Path(review.__file__)),str(source),'--workspace',str(workspace),'--model',args.model],check=True)
                request('/api/open',dict(path=str(workspace/'review.json')))
            else:
                uploaded=request('/api/upload',raw=source.read_bytes(),headers={'Content-Type':'application/octet-stream','X-Filename':urllib.parse.quote(source.name)})
                workspace=Path(uploaded['workspace'])
                request('/api/open',dict(path=uploaded['path'],workspace=str(workspace),model=args.model))
            state=wait();doc=state['document']
            assert doc['transcript']['status']=='ready'
            transcript=' '.join(s['text'] for s in doc['transcript']['segments'])
            assert len(transcript.split())>=5,transcript
            duration=doc['source']['duration'];quarter=duration/4
            doc['marks']=[dict(id='keep',kind='good',text='Keep this introduction',source_start=0,source_end=quarter/2),
                          dict(id='cut',kind='bad',text='Remove this mistake',source_start=quarter,source_end=quarter*2),
                          dict(id='comment',kind='comment',text='Explain the result clearly',source_start=quarter*2,source_end=quarter*3)]
            doc['objects']=[dict(id='giraffe',text='Add a giraffe' if index==0 else 'Add a colorful diagram',source_start=quarter/2,source_end=quarter*3,rect=dict(x=.55,y=.15,width=.3,height=.4)),
                            dict(id='inside-cut',text='Request inside a cut must remain visible in handoff',source_start=quarter*1.2,source_end=quarter*1.8,rect=dict(x=.1,y=.1,width=.2,height=.2))]
            saved=request('/api/save',dict(revision=doc['revision'],source_sha256=doc['source']['sha256'],marks=doc['marks'],objects=doc['objects']))
            # A second save models changing geometry and bar lifetime, with revision checks.
            doc['objects'][0]['rect']['x']=.45;doc['objects'][0]['source_end']=quarter*3.5
            request('/api/save',dict(revision=saved['revision'],source_sha256=doc['source']['sha256'],marks=doc['marks'],objects=doc['objects']))
            request('/api/open',dict(path=str(workspace/'review.json')))
            reopened=wait()['document']
            assert reopened['marks']==doc['marks'] and reopened['objects']==doc['objects']
            request('/api/export',dict(render=True));finished=wait();target=Path(finished['job']['export'])
            timeline=review.read(target/'edit/timeline.json');mapped=review.read(target/'storyboard/annotations.resolved.json')['notes']
            visual=next(n for n in mapped if n['id']=='giraffe');removed=next(n for n in mapped if n['id']=='inside-cut')
            assert len(visual['windows'])==2 and visual['rect']['x']==.45
            assert removed['status']=='removed-by-edit' and not removed['windows']
            assert visual['timing']=='approximate' and visual['authority']=='required'
            cut=target/'composition/assets/rough-cut.mp4';info=review.video.probe(cut)
            delta=abs(float(info['format']['duration'])-timeline['duration'])
            assert delta<=.15 and (target/'edit/narration.wav').is_file()
            # The same export really passes the existing pipeline importer.
            subprocess.run([sys.executable,str(review.ROOT/'scripts/video.py'),'import-edit',str(target),str(target/'edit/decisions.json')],check=True)
            assert review.read(target/'edit/timeline.json')['revision']==timeline['revision']
            assert original_hash==review.fingerprint(source)
            frame=root/f'export-{index}.png'
            subprocess.run(['ffmpeg','-v','error','-y','-ss','0.5','-i',str(cut),'-frames:v','1',str(frame)],check=True)
            evidence.append(dict(video=str(source),workspace=str(workspace),export=str(target),source_hash=original_hash,
                                 transcript=transcript,segments=len(doc['transcript']['segments']),source_duration=duration,
                                 output_duration=timeline['duration'],render_duration_delta=delta,object_windows=visual['windows'],
                                 removed_request_status=removed['status'],source_unchanged=True,pipeline_import_verified=True))
            print(f'Video {index+1}: passed real transcription, save/reopen, geometry/timing, render and pipeline import',flush=True)
        review.write(root/'evidence.json',dict(passed=True,interface='HTTP API; browser automation not performed',videos=evidence))
        print(root/'evidence.json',flush=True)
    finally:
        app.shutdown();app.server_close();thread.join()


if __name__=='__main__':main()
