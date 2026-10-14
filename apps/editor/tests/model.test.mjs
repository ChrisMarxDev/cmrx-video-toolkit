import test from 'node:test';
import assert from 'node:assert/strict';
import {range,moveInterval,moveRect,drawRect,conflict,retained} from '../web/model.mjs';
test('reverse selection and bounds',()=>{assert.deepEqual(range(12,-3,10),[0,10]);});
test('timeline drag preserves length and bounds',()=>{assert.deepEqual(moveInterval({source_start:2,source_end:5},10,10),{source_start:7,source_end:10});assert.equal(moveInterval({source_start:2,source_end:5},9,10,'start').source_start,4.95);});
test('rectangle dragging and resizing respect video bounds',()=>{const rect={x:.5,y:.5,width:.3,height:.3};assert.deepEqual(moveRect(rect,1,-1),{x:.7,y:0,width:.3,height:.3});assert.deepEqual(moveRect(rect,1,1,true),{x:.5,y:.5,width:.5,height:.5});assert.deepEqual(drawRect(.8,.7,.2,.1),{x:.2,y:.1,width:.6000000000000001,height:.6});});
test('keep/cut conflict and adjacency',()=>{assert.equal(conflict([{kind:'good',source_start:0,source_end:2},{kind:'bad',source_start:1,source_end:3}]),true);assert.equal(conflict([{kind:'good',source_start:0,source_end:2},{kind:'bad',source_start:2,source_end:3}]),false);});
test('cut preview unions overlapping deletions',()=>{assert.deepEqual(retained([{kind:'bad',source_start:2,source_end:4},{kind:'bad',source_start:3,source_end:6}],10),[[0,2],[6,10]]);});
