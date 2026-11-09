import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addComment,
  updateComment,
  locateComment,
  patchClip,
  splitClip,
  validate,
} from "../dist/model.mjs";
const project = () => ({
  schemaVersion: 1,
  revision: 0,
  name: "Comments",
  width: 640,
  height: 360,
  fps: 24,
  assets: [
    {
      id: "source",
      name: "Source",
      path: "media/source.mp4",
      duration: 20,
      audio: true,
    },
  ],
  clips: [
    {
      id: "clip",
      name: "Clip",
      kind: "video",
      assetId: "source",
      start: 2,
      in: 4,
      duration: 6,
      track: 0,
      x: 0,
      y: 0,
      width: 640,
      height: 360,
      muted: false,
    },
  ],
  notes: { opaque: true },
});
test("clip/source anchors follow moves, retain trimmed/deleted notes and route split-boundary comments right", () => {
  let p = addComment(project(), "At source six", {
    type: "clip",
    clipId: "clip",
    sourceTime: 6,
  });
  p = addComment(p, "Overall edit", { type: "timeline", time: 4 });
  const [clipNote, timelineNote] = p.comments;
  assert.equal(clipNote.anchor.sourceAssetId, "source");
  const replaced = structuredClone(p);
  replaced.assets.push({ ...replaced.assets[0], id: "other" });
  replaced.clips[0].assetId = "other";
  assert.equal(
    locateComment(validate(replaced), clipNote).reason,
    "source-changed",
  );
  clipNote.custom = { keep: true };
  assert.equal(locateComment(p, clipNote).time, 4);
  p = patchClip(p, "clip", { start: 5 });
  assert.equal(locateComment(p, clipNote).time, 7);
  assert.equal(locateComment(p, timelineNote).time, 4);
  const trimmed = patchClip(p, "clip", { in: 7, duration: 3 });
  assert.equal(locateComment(trimmed, clipNote).reason, "trimmed-out");
  assert.deepEqual(trimmed.comments[0], clipNote);
  assert.equal(locateComment(p, clipNote).time, 7);
  const split = splitClip(p, "clip", 7);
  assert.equal(split.comments[0].anchor.clipId, split.clips[1].id);
  assert.equal(split.comments[0].anchor.sourceTime, 6);
  assert.equal(locateComment(split, split.comments[0]).time, 7);
  split.clips = [];
  assert.equal(
    locateComment(validate(split), split.comments[0]).reason,
    "missing-clip",
  );
  assert.equal(
    locateComment(split, split.comments[1]).reason,
    "outside-timeline",
  );
  assert.deepEqual(split.comments[0].custom, { keep: true });
  assert.deepEqual(split.notes, { opaque: true });
});
test("comments validate input, retain opaque fields, and resolve without retargeting", () => {
  const p = addComment(project(), "Feedback", { type: "timeline", time: 3 });
  assert.equal(p.comments[0].createdRevision, 1);
  const resolved = updateComment(p, p.comments[0].id, { status: "resolved" });
  assert.equal(resolved.comments[0].status, "resolved");
  assert.deepEqual(resolved.comments[0].anchor, p.comments[0].anchor);
  assert.equal(p.comments[0].status, "open");
  assert.throws(
    () => addComment(project(), " ", { type: "timeline", time: 3 }),
    /body/,
  );
  assert.throws(
    () =>
      addComment(project(), "Feedback", {
        type: "clip",
        clipId: "missing",
        sourceTime: 1,
      }),
    /target/,
  );
  assert.throws(
    () =>
      addComment(project(), "Feedback", {
        type: "clip",
        clipId: "clip",
        sourceTime: 10,
      }),
    /target/,
  );
  assert.throws(
    () => validate({ ...p, comments: [...p.comments, p.comments[0]] }),
    /unique/,
  );
  assert.throws(
    () => updateComment(p, p.comments[0].id, { status: "done" }),
    /status/,
  );
  assert.throws(
    () =>
      validate({
        ...p,
        comments: [
          { ...p.comments[0], anchor: { type: "timeline", time: NaN } },
        ],
      }),
    /time/,
  );
  assert.equal(validate(project()).comments, undefined);
});
