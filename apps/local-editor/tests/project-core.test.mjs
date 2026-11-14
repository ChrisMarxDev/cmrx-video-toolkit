import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  time,
  fromFrames,
  frameIndex,
  fromSeconds,
  add,
  subtract,
  seconds,
  rate,
  canonicalize,
  assertTiming,
  resolveProject,
  sourceWindow,
  indexTranscript,
  exportOTIO,
  inspectOTIO,
} from "../dist/project-core.mjs";
import { Workspace } from "../dist/workspace.mjs";
import { Checkpoints } from "../dist/project-storage.mjs";
const base = () => ({
  schemaVersion: 1,
  revision: 0,
  name: "Development",
  width: 640,
  height: 360,
  fps: 30,
  assets: [
    {
      id: "a",
      name: "Original",
      path: "media/input.mp4",
      duration: 900,
      audio: true,
    },
  ],
  clips: [
    {
      id: "c",
      kind: "video",
      name: "excerpt",
      assetId: "a",
      start: 0,
      in: 700,
      duration: 8,
      track: 0,
      x: 0,
      y: 0,
      width: 640,
      height: 360,
      muted: false,
    },
  ],
});
const folder = () =>
  fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-project-core-"));
test("exact rational source clocks survive mixed rate arithmetic, negative rounding and JSON", () => {
  const a = fromFrames("10000000000000001", "30000/1001");
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.equal(frameIndex(a, "30000/1001"), "10000000000000001");
  assert.deepEqual(subtract(add(a, time(1, 48000)), a), time(1, 48000));
  assert.equal(frameIndex(time(-1, 2), 1, "floor"), "-1");
  assert.equal(frameIndex(time(-1, 2), 1, "ceil"), "0");
  assert.throws(() => rate({ numerator: 30, denominator: 0 }));
  assert.throws(() => time(1, 0));
});
test("accepted operations migrate legacy timing; exact edits, undo and external conflicts retain one authority", () => {
  const root = folder();
  let w;
  try {
    fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(base()));
    w = new Workspace(root);
    w.transact(0, [
      { type: "clip-time", id: "c", timing: { in: time(21001, 30) } },
    ]);
    assert.deepEqual(w.project.clips[0].timing.in, time(21001, 30));
    w.transact(1, [{ type: "split", id: "c", time: 3 }]);
    assertTiming(w.project);
    assert.equal(w.project.clips.length, 2);
    w.travel(2, -1);
    assert.equal(w.project.clips.length, 1);
    const bad = structuredClone(w.project);
    bad.clips[0].start = 1;
    fs.writeFileSync(w.file, JSON.stringify(bad));
    w.poll();
    assert.match(w.error, /conflicting/);
    assert.equal(w.project.clips[0].start, 0);
  } finally {
    w?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("source index identities survive timeline changes, re-transcription versions and explicit reconciliation", () => {
  const p = base(),
    a = p.assets[0];
  Object.assign(
    a,
    indexTranscript(a, [{ start: 702, end: 703, text: "hello" }]),
  );
  const first = a.transcript[0].id;
  const data = sourceWindow(
    a,
    {
      sourceStart: 700,
      interval: 1,
      count: 30,
      columns: 12,
      peakRate: 100,
      peaks: Array(3000).fill(0.5),
    },
    { start: 700, duration: 30 },
  );
  assert.equal(data.clock, "render-input");
  assert.equal(data.cues[0].id, first);
  assert.equal(data.levels.length, 600);
  assert.equal(data.frames[0].sourceTime, 700);
  p.clips = [];
  assert.equal(
    sourceWindow(
      a,
      { interval: 1, count: 0, peakRate: 100 },
      { start: 702, duration: 1 },
    ).cues[0].id,
    first,
  );
  const next = indexTranscript(a, a.transcript);
  assert.notEqual(next.transcript[0].id, first);
  assert.equal(
    indexTranscript(a, a.transcript, { reconcile: true }).transcript[0].id,
    first,
  );
  assert.throws(() => sourceWindow(a, {}, { start: 0, duration: 121 }));
});
test("dynamic Dart definitions generate resolved independent properties and validate atomic edits", () => {
  const root = folder();
  let w;
  try {
    fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(base()));
    w = new Workspace(root);
    w.transact(0, [
      {
        type: "component",
        definition: {
          id: "never-seen",
          schemaVersion: 1,
          source: "lib/new_shader.dart",
          properties: {
            title: { type: "string" },
            radius: { type: "number", min: 1, max: 100 },
            color: { type: "color" },
            visible: { type: "boolean" },
          },
          defaults: {
            title: "new",
            radius: 12,
            color: "#ff0000",
            visible: true,
          },
        },
      },
      {
        type: "add-graphics",
        id: "g",
        source: "lib/new_shader.dart",
        duration: 2,
        track: 1,
      },
      {
        type: "project",
        project: {
          ...base(),
          components: [
            {
              id: "dynamic",
              schemaVersion: 1,
              source: "lib/brand_new.dart",
              properties: { amount: { type: "number", min: 0, max: 10 } },
              defaults: { amount: 2 },
            },
          ],
          clips: [
            ...base().clips,
            {
              ...base().clips[0],
              id: "g",
              kind: "graphics",
              assetId: undefined,
              componentId: "dynamic",
              props: { amount: 4 },
            },
          ],
        },
      },
    ]);
    assert.equal(
      resolveProject(w.project).project.clips[1].props.source,
      "lib/brand_new.dart",
    );
    assert.throws(() =>
      w.transact(1, [
        { type: "component-props", id: "g", props: { amount: 12 } },
      ]),
    );
    assert.equal(w.project.revision, 1);
    w.transact(1, [{ type: "component-props", id: "g", props: { amount: 6 } }]);
    assert.equal(resolveProject(w.project).project.clips[1].props.amount, 6);
    w.travel(2, -1);
    assert.equal(w.project.clips[1].props.amount, 4);
  } finally {
    w?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("optional semantic anchors follow moves/splits and hide removed, stale or ambiguous occurrences without losing authored clips", () => {
  const root = folder();
  let w;
  try {
    const p = base();
    Object.assign(
      p.assets[0],
      indexTranscript(p.assets[0], [{ start: 704, end: 705, text: "anchor" }]),
    );
    p.clips.push({
      ...p.clips[0],
      id: "g",
      kind: "graphics",
      assetId: undefined,
      anchor: {
        type: "semantic",
        assetId: "a",
        cueId: p.assets[0].transcript[0].id,
        clipId: "c",
      },
      start: 4,
      duration: 1,
      props: { source: "lib/any.dart" },
    });
    fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(p));
    w = new Workspace(root);
    w.transact(0, [{ type: "split", id: "c", time: 3 }]);
    let resolved = resolveProject(w.project);
    assert.equal(resolved.project.clips.find((c) => c.id === "g").start, 4);
    const right = w.project.clips.find(
      (c) => c.kind === "video" && c.id !== "c",
    );
    w.transact(1, [{ type: "clip", id: right.id, patch: { start: 5 } }]);
    assert.equal(
      resolveProject(w.project).project.clips.find((c) => c.id === "g").start,
      6,
    );
    w.transact(2, [{ type: "delete", id: right.id }]);
    resolved = resolveProject(w.project);
    assert.equal(
      resolved.project.clips.some((c) => c.id === "g"),
      false,
    );
    assert.equal(
      w.project.clips.some((c) => c.id === "g"),
      true,
    );
    assert.equal(resolved.warnings[0].code, "trimmed-or-missing-occurrence");
  } finally {
    w?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("whole-project checkpoint restores source and document, preserves current work, survives restart and rolls back failure", async () => {
  const root = folder();
  try {
    fs.mkdirSync(path.join(root, "lib"));
    fs.mkdirSync(path.join(root, "media"));
    fs.writeFileSync(path.join(root, "lib/graphic.dart"), "first");
    fs.writeFileSync(path.join(root, "media/input.mp4"), "immutable");
    let p = base();
    const c = new Checkpoints(root),
      saved = c.create(p, "First");
    fs.writeFileSync(path.join(root, "lib/graphic.dart"), "second");
    fs.writeFileSync(path.join(root, "lib/extra.dart"), "extra");
    p = { ...p, revision: 2, name: "Second" };
    assert.deepEqual(c.diff(saved.id, p).removed, ["lib/extra.dart"]);
    await assert.rejects(
      c.restore(saved.id, { baseRevision: 1, current: p, apply: () => {} }),
      /revision/,
    );
    await assert.rejects(
      c.restore(saved.id, {
        baseRevision: 2,
        current: p,
        injectFailure: () => {
          throw Error("disk failure");
        },
        apply: () => {},
      }),
      /disk failure/,
    );
    assert.equal(
      fs.readFileSync(path.join(root, "lib/graphic.dart"), "utf8"),
      "second",
    );
    assert.equal(
      fs.readFileSync(path.join(root, "lib/extra.dart"), "utf8"),
      "extra",
    );
    const result = await new Checkpoints(root).restore(saved.id, {
      baseRevision: 2,
      current: p,
      apply: async (doc) => ({ ...doc, revision: 3 }),
    });
    assert.equal(result.project.name, "Development");
    assert.equal(result.project.revision, 3);
    assert.equal(
      fs.readFileSync(path.join(root, "lib/graphic.dart"), "utf8"),
      "first",
    );
    assert.equal(fs.existsSync(path.join(root, "lib/extra.dart")), false);
    assert.ok(c.read(result.safetyCheckpoint));
    fs.writeFileSync(path.join(root, "media/input.mp4"), "changed");
    await assert.rejects(
      c.restore(saved.id, {
        baseRevision: 3,
        current: result.project,
        apply: () => {},
      }),
      /media missing or changed/,
    );
    fs.symlinkSync("/tmp", path.join(root, "lib/escape"));
    assert.throws(() => c.create(p), /symlinks/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("interchange preserves footage gaps/source ranges and native project; reports programmable losses and overlaps", () => {
  const p = base();
  p.clips[0].start = 2;
  p.clips.push({
    ...p.clips[0],
    id: "g",
    kind: "graphics",
    assetId: undefined,
    props: { source: "lib/a.dart" },
    track: 1,
  });
  const { timeline, warnings } = exportOTIO(p);
  assert.ok(warnings.some((w) => w.includes("programmable")));
  const round = inspectOTIO(JSON.parse(JSON.stringify(timeline)));
  assert.equal(round.clips[0].start, 2);
  assert.equal(round.clips[0].in, 700);
  assert.equal(round.clips[0].duration, 8);
  assert.deepEqual(round.nativeProject, JSON.parse(JSON.stringify(p)));
  assert.equal(round.clips[0].path, "media/input.mp4");
  assert.throws(() =>
    inspectOTIO({
      OTIO_SCHEMA: "Timeline.1",
      tracks: { children: [{ children: [{ OTIO_SCHEMA: "Transition.1" }] }] },
    }),
  );
});

test("interrupted checkpoint restore recovers old sources or retains a committed restore after service restart", () => {
  const root = folder();
  try {
    fs.mkdirSync(path.join(root, "lib"));
    fs.mkdirSync(path.join(root, "media"));
    fs.writeFileSync(path.join(root, "media/input.mp4"), "source");
    fs.writeFileSync(path.join(root, "lib/a.dart"), "old");
    const cp = new Checkpoints(root),
      old = base(),
      target = cp.create(old, "Target");
    fs.writeFileSync(path.join(root, "lib/a.dart"), "current");
    const current = { ...old, name: "Current", revision: 1 },
      safety = cp.create(current, "Safety");
    const journal = path.join(cp.dir, "restore.json");
    fs.writeFileSync(
      journal,
      JSON.stringify({ target: target.id, safety: safety.id }),
    );
    fs.writeFileSync(path.join(root, "lib/a.dart"), "partially restored");
    new Checkpoints(root).recover(current);
    assert.equal(
      fs.readFileSync(path.join(root, "lib/a.dart"), "utf8"),
      "current",
    );
    assert.equal(fs.existsSync(journal), false);
    fs.writeFileSync(
      journal,
      JSON.stringify({ target: target.id, safety: safety.id }),
    );
    fs.writeFileSync(path.join(root, "lib/a.dart"), "old");
    new Checkpoints(root).recover({ ...old, revision: 2 });
    assert.equal(fs.readFileSync(path.join(root, "lib/a.dart"), "utf8"), "old");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("single-frame edits preserve minimum duration through exact migration, split and reopen", () => {
  for (const value of [
    1 / 30,
    0.3,
    12.300000000000001,
    Number.MIN_VALUE,
    0,
    -0.1,
  ])
    assert.equal(seconds(fromSeconds(value)), value);
  const root = folder();
  let w;
  try {
    const p = base();
    p.clips[0].duration = 0.3;
    fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(p));
    w = new Workspace(root);
    w.transact(0, [{ type: "split", id: "c", time: 8 / 30 }]);
    const right = w.project.clips.find((c) => c.id !== "c");
    assert.equal(right.duration, 1 / 30);
    assert.deepEqual(right.timing.duration, time(1, 30));
    assertTiming(w.project);
    w.close();
    w = new Workspace(root);
    assert.equal(w.project.clips.length, 2);
    assert.equal(w.error, "");
  } finally {
    w?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("immutable audio/video assets are referenced, not copied or removed by source checkpoint restore", async () => {
  const root = folder();
  try {
    fs.mkdirSync(path.join(root, "media"));
    fs.mkdirSync(path.join(root, "assets"));
    fs.mkdirSync(path.join(root, "lib"));
    fs.writeFileSync(path.join(root, "media/input.mp4"), "source");
    fs.writeFileSync(path.join(root, "assets/upload.mov"), "recording");
    fs.writeFileSync(path.join(root, "lib/a.dart"), "before");
    const cp = new Checkpoints(root),
      p = base(),
      saved = cp.create(p);
    assert.ok(
      cp.read(saved.id).media.some((m) => m.path === "assets/upload.mov"),
    );
    assert.equal(
      cp.read(saved.id).files.some((f) => f.path === "assets/upload.mov"),
      false,
    );
    fs.writeFileSync(path.join(root, "assets/new-upload.mov"), "new recording");
    fs.writeFileSync(path.join(root, "lib/a.dart"), "after");
    await cp.restore(saved.id, {
      current: p,
      baseRevision: 0,
      apply: async (p) => p,
    });
    assert.equal(
      fs.readFileSync(path.join(root, "lib/a.dart"), "utf8"),
      "before",
    );
    assert.equal(
      fs.readFileSync(path.join(root, "assets/new-upload.mov"), "utf8"),
      "new recording",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
