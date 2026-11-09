import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTranscript, timelineTranscript } from "../dist/transcript.mjs";
import { validate, splitClip, patchClip } from "../dist/model.mjs";
const project = () => ({
  schemaVersion: 1,
  revision: 0,
  name: "Transcript",
  width: 640,
  height: 360,
  fps: 24,
  assets: [
    {
      id: "a",
      path: "media/a.mp4",
      name: "A",
      duration: 10,
      audio: true,
      transcript: [
        { start: 1, end: 3, text: "First sentence" },
        { start: 4, end: 6, text: "Second sentence" },
      ],
    },
  ],
  clips: [
    {
      id: "c",
      name: "C",
      kind: "video",
      assetId: "a",
      start: 10,
      in: 2,
      duration: 4,
      track: 0,
      x: 0,
      y: 0,
      width: 640,
      height: 360,
      muted: false,
    },
  ],
});
test("SRT/VTT and JSON retain source timestamps, reject malformed timing", () => {
  const cue = { start: 1.25, end: 3, text: "Hello\nworld" };
  assert.deepEqual(
    parseTranscript("1\n00:00:01,250 --> 00:00:03,000\nHello\nworld"),
    [cue],
  );
  assert.deepEqual(
    parseTranscript(
      "WEBVTT\n\n00:01.250 --> 00:03.000 align:start\nHello\nworld",
    ),
    [cue],
  );
  assert.deepEqual(parseTranscript(JSON.stringify({ segments: [cue] })), [cue]);
  assert.throws(() => parseTranscript("Not timed"));
  assert.throws(() => parseTranscript("00:90:00,000 --> 00:91:00,000\nNo"));
});
test("transcripts follow move/trim/split without modifying source text or times", () => {
  const p = validate(project()),
    original = structuredClone(p.assets);
  assert.deepEqual(
    timelineTranscript(p).map((c) => [c.start, c.end, c.text]),
    [
      [10, 11, "First sentence"],
      [12, 14, "Second sentence"],
    ],
  );
  const moved = patchClip(p, "c", { start: 20 });
  assert.equal(timelineTranscript(moved)[0].start, 20);
  const split = splitClip(p, "c", 12);
  assert.deepEqual(
    timelineTranscript(split).map((c) => [c.start, c.end]),
    [
      [10, 11],
      [12, 14],
    ],
  );
  assert.deepEqual(split.assets, original);
  const trimmed = patchClip(p, "c", { in: 4, duration: 2 });
  assert.equal(timelineTranscript(trimmed).length, 1);
});
test("invalid transcript cannot enter project state", () => {
  for (const cue of [
    { start: 0, end: 11, text: "Beyond source" },
    { start: 3, end: 2, text: "Reversed" },
    { start: 1, end: 2, text: "" },
    { start: NaN, end: 2, text: "Bad" },
  ]) {
    const p = project();
    p.assets[0].transcript = [cue];
    assert.throws(() => validate(p));
  }
  const p = project();
  p.assets[0].transcript.reverse();
  assert.throws(() => validate(p), /ordered/);
});
