import { test } from "node:test";
import assert from "node:assert/strict";
import {
  layoutTimeline,
  clipWidth,
  trackAtPointer,
} from "../dist/timeline.mjs";
const clip = (id, start, duration, track = 0) => ({
  id,
  start,
  duration,
  track,
});
test("identical, nested and partial overlaps get separate rows without changing authored clips", () => {
  const clips = [
    clip("a", 0, 4),
    clip("b", 0, 4),
    clip("inside", 1, 1),
    clip("partial", 3, 2),
    clip("adjacent", 5, 1),
    clip("overlay", 0, 4, 1),
  ];
  const before = structuredClone(clips);
  const rows = layoutTimeline(clips, 80);
  assert.equal(rows[0].laneCount, 1);
  assert.equal(rows[1].laneCount, 3);
  assert.deepEqual(layoutTimeline([...clips].reverse(), 80), rows);
  for (const row of rows)
    for (const a of row.items)
      for (const b of row.items) {
        if (a.clip.id === b.clip.id || a.lane !== b.lane) continue;
        assert.ok(
          a.clip.start * 80 + clipWidth(a.clip, 80) <= b.clip.start * 80 ||
            b.clip.start * 80 + clipWidth(b.clip, 80) <= a.clip.start * 80,
        );
      }
  assert.deepEqual(clips, before);
});
test("short adjacent clips cannot obscure each other at minimum visual width", () => {
  const clips = [
    clip("a", 0, 1 / 60),
    clip("b", 1 / 60, 1 / 60),
    clip("c", 2 / 60, 1 / 60),
  ];
  assert.equal(layoutTimeline(clips, 40)[0].laneCount, 3);
  assert.equal(
    layoutTimeline([clip("a", 0, 1), clip("b", 1, 1)], 80)[0].laneCount,
    1,
  );
  assert.equal(layoutTimeline([], 80)[0].laneCount, 1);
});
test("vertical drag uses expanded track bounds, not a fixed row offset", () => {
  const bounds = [
    { track: 2, top: 0, bottom: 128 },
    { track: 1, top: 128, bottom: 192 },
    { track: 0, top: 192, bottom: 512 },
  ];
  assert.equal(trackAtPointer(bounds, 200, 0), 0);
  assert.equal(trackAtPointer(bounds, 450, 0), 0);
  assert.equal(trackAtPointer(bounds, 160, 0), 1);
  assert.equal(trackAtPointer(bounds, 40, 0), 2);
  assert.equal(trackAtPointer(bounds, -30, 0), 3);
  assert.equal(trackAtPointer(bounds, -1000, 0), 7);
  assert.equal(trackAtPointer(bounds, 600, 2), 0);
});

test("edge snapping supports both moving edges, trimming, bypass and source limits", async () => {
  const { snapClipDrag } = await import("../dist/timeline.mjs");
  const c = {
    ...clip("moving", 1, 2),
    kind: "video",
    assetId: "source",
    in: 1,
  };
  const p = {
    fps: 24,
    assets: [{ id: "source", duration: 5 }],
    clips: [c, clip("next", 5, 1)],
  };
  let result = snapClipDrag(p, c, "move", 1.94, 0, 80, 0, true);
  assert.equal(result.patch.start, 3); // Its end meets the next start.
  assert.equal(result.guide, 5);
  result = snapClipDrag(p, c, "move", 1.94, 0, 80, 0, false);
  assert.notEqual(result.patch.start, 3);
  assert.equal(result.guide, null);
  result = snapClipDrag(p, c, "right", 0.94, 0, 80, 4, true);
  assert.equal(result.patch.duration, 3);
  assert.equal(result.guide, 4);
  result = snapClipDrag(p, c, "left", 0.94, 0, 80, 2, true);
  assert.deepEqual(result.patch, { start: 2, in: 2, duration: 1 });
  assert.equal(result.guide, 2);
  result = snapClipDrag(p, c, "right", 100, 0, 80, 7, true);
  assert.equal(result.patch.duration, 4); // Source duration limits extension.
  assert.ok(result.patch.duration + c.in <= 5);
  result = snapClipDrag(p, c, "move", 1000, 0, 80, 0, true);
  assert.equal(result.patch.start + c.duration, 600);
  const nearEnd = { ...c, start: 599, duration: 1 };
  result = snapClipDrag(p, nearEnd, "right", 5, 0, 80, 0, false);
  assert.equal(result.patch.duration, 1);
});
