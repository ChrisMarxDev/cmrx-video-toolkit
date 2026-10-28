"""Final-state validation, one remap, no partial updates, and crash recovery."""
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from scripts import video

transaction = video.edit_transaction


class BatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.p = Path(self.temp.name)
        video.write(self.p/'project.json', dict(source=str(self.p/'original.mp4'), fps=30))
        video.write(self.p/'annotations.json', dict(version=1, notes=[dict(id='note',source_start=1.4,source_end=1.6)]))
        data = dict(version=2,videoPath=str(self.p/'original.mp4'),retainedRanges=[
            dict(clip_id='a',source_start=0,source_end=1),
            dict(clip_id='b',source_start=1,source_end=2),
            dict(clip_id='c',source_start=3,source_end=4)])
        self.t = video.import_cut(data,4)
        video.write(self.p/'edit/decisions.json',data)
        video.write(self.p/'edit/timeline.json',self.t)
        video.write(self.p/'transcript/segments.json',dict(time_base='source',segments=[
            dict(id='s',text='hello',source_start=1.1,source_end=1.7)]))
        video.remap_transcript(self.p,self.t)
        video.write(self.p/'storyboard/annotations.resolved.json',video.map_annotations(video.read(self.p/'annotations.json'),self.t))
        video.write(self.p/'edit/clips.json',dict(timeline_revision=self.t['revision']))
        (self.p/'composition/lib').mkdir(parents=True)
        (self.p/'composition/lib/main.dart').write_text('// user-authored custom component scenes')
        self.probe=patch.object(video,'probe',return_value={'format':{'duration':'4'}})
        self.probe.start(); self.addCleanup(self.probe.stop)

    def contents(self):
        return {str(f.relative_to(self.p)):f.read_bytes() for f in self.p.rglob('*') if f.is_file()}

    def apply(self, operations, **kwargs):
        return video.apply_adjustments(self.p,operations,self.t['revision'],**kwargs)

    def test_final_state_can_be_valid_when_first_individual_change_is_not(self):
        before=self.contents()
        with self.assertRaises(ValueError): self.apply([dict(clip_id='a',end=1.2)])
        self.assertEqual(before,self.contents())
        original=video.remap_transcript
        with patch.object(video,'remap_transcript',wraps=original) as mapper:
            result=self.apply([dict(clip_id='a',end=1.2),dict(clip_id='b',start=1.2)])
            mapper.assert_called_once()
        updated=video.read(self.p/'edit/timeline.json')
        self.assertEqual([s['clip_id'] for s in updated['spans']],['a','b','c'])
        self.assertEqual(updated['duration'],3)
        self.assertNotEqual(updated['revision'],self.t['revision'])
        self.assertEqual(video.read(self.p/'transcript/output-segments.json')['timeline_revision'],updated['revision'])
        self.assertEqual(video.read(self.p/'storyboard/annotations.resolved.json')['timeline_revision'],updated['revision'])
        self.assertEqual(result['caption_status'],'needs-caption-review')
        self.assertEqual((self.p/'transcript/output.srt').read_text(),'')
        self.assertEqual((self.p/'composition/lib/main.dart').read_bytes(),before['composition/lib/main.dart'])
        self.assertEqual((self.p/'edit/clips.json').read_bytes(),before['edit/clips.json'])
        self.assertFalse((self.p/transaction.DIRECTORY).exists())

    def test_dry_run_and_invalid_stale_or_duplicate_operations_leave_everything_unchanged(self):
        before=self.contents()
        summary=self.apply([dict(clip_id='a',start=.2)],dry_run=True)
        self.assertTrue(summary['dry_run']); self.assertEqual(before,self.contents())
        for ops in [[],[dict(clip_id='missing',start=0)], [dict(clip_id='a',end=float('nan'))],
                    [dict(clip_id='a',start=None)], [dict(clip_id='a',start=.2),dict(clip_id='a',end=.8)],
                    [dict(clip_id='a',start=.2),dict(clip_id='b',end=9)], [dict(clip_id='a',speed=2)]]:
            with self.assertRaises(ValueError): self.apply(ops)
            self.assertEqual(before,self.contents())
        with self.assertRaisesRegex(ValueError,'Stale'):
            video.apply_adjustments(self.p,[dict(clip_id='a',start=.2)],'old')
        self.assertEqual(before,self.contents())

    def test_mapping_and_companion_failure_do_not_publish(self):
        before=self.contents()
        for name in ('remap_transcript','validate_companion_ranges'):
            with patch.object(video,name,side_effect=ValueError('synthetic failure')):
                with self.assertRaises(ValueError): self.apply([dict(clip_id='a',start=.2)])
            self.assertEqual(before,self.contents())

    def test_write_failure_rolls_back_all_artifacts(self):
        before=self.contents(); real=transaction.replace_file; count=0
        def fail_once(source,target):
            nonlocal count
            count+=1
            if count==3: raise OSError('synthetic write failure')
            return real(source,target)
        with patch.object(transaction,'replace_file',side_effect=fail_once):
            with self.assertRaises(OSError): self.apply([dict(clip_id='a',start=.2)])
        self.assertEqual(before,self.contents())

    def test_changed_inputs_are_not_overwritten(self):
        real=video.remap_transcript
        def edit_while_planning(stage,timeline):
            real(stage,timeline)
            (self.p/'annotations.json').write_text('{"external_change":true}')
        before=transaction.snapshot(self.p,transaction.ARTIFACTS)
        with patch.object(video,'remap_transcript',side_effect=edit_while_planning):
            with self.assertRaisesRegex(ValueError,'changed'): self.apply([dict(clip_id='a',start=.2)])
        self.assertEqual(before,transaction.snapshot(self.p,transaction.ARTIFACTS))
        self.assertTrue(video.read(self.p/'annotations.json')['external_change'])

    def test_committed_cleanup_failure_is_reported_as_success_with_recovery_pending(self):
        real=transaction.shutil.rmtree
        def fail_journal(path,*args,**kwargs):
            if Path(path).name==transaction.DIRECTORY: raise OSError('cleanup unavailable')
            return real(path,*args,**kwargs)
        with patch.object(transaction.shutil,'rmtree',side_effect=fail_journal):
            result=self.apply([dict(clip_id='a',start=.2)])
        self.assertTrue(result['recovery_pending'])
        self.assertEqual(video.read(self.p/'edit/timeline.json')['revision'],result['revision'])
        self.assertEqual(video.read(self.p/transaction.DIRECTORY/'state.json')['status'],'committed')

    def test_process_crash_is_recoverable_and_pipeline_refuses_partial_state(self):
        before=self.contents()
        script='''import os,sys
from pathlib import Path
from scripts import edit_transaction as t
p=Path(sys.argv[1]); old=t.snapshot(p,t.ARTIFACTS); real=t.replace_file; count=0
def crash(source,target):
 global count
 count+=1
 if count==3: os._exit(7)
 real(source,target)
t.replace_file=crash
t.publish(p,{name:b'new' for name in t.ARTIFACTS},old)
'''
        result=subprocess.run([sys.executable,'-c',script,str(self.p)],cwd=Path(__file__).resolve().parents[1])
        self.assertEqual(result.returncode,7)
        with self.assertRaisesRegex(ValueError,'recover-edits'):video.project_dir(self.p)
        self.assertEqual(transaction.recover(self.p),'Restored previous edit.')
        self.assertEqual(before,self.contents())

    def test_batch_entrypoint_dry_run_uses_revision_guard(self):
        request=self.p/'batch.json';video.write(request,dict(version=1,operations=[dict(clip_id='a',start=.2)]))
        result=video.apply_edits(SimpleNamespace(project=str(self.p),file=str(request),expected_revision=self.t['revision'],dry_run=True))
        self.assertTrue(result['dry_run'])
        self.assertEqual(video.read(self.p/'edit/timeline.json'),self.t)
