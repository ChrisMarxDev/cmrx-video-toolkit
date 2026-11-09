import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { validate, dragClip, splitClip, chooseTake } from "../dist/model.mjs";
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "editor-fixture-"));
execFileSync(process.execPath, ["scripts/demo.mjs", "--workspace", fixture]);
after(() => fs.rmSync(fixture, { recursive: true, force: true }));
const demo = JSON.parse(
  fs.readFileSync(path.join(fixture, "project.json"), "utf8"),
);
const clean = () => {
  const p = structuredClone(demo);
  p.revision = 0;
  return p;
};
async function until(fn) {
  for (let n = 0; n < 120; n++) {
    const result = await fn();
    if (result) return result;
    await wait(100);
  }
  throw Error("Condition timed out");
}
const start = async (root) => {
  const proc = spawn(
    process.execPath,
    ["dist/server.mjs", "--workspace", root, "--port", "0"],
    { stdio: "pipe" },
  );
  let log = "";
  proc.stderr.on("data", (d) => (log += d));
  const connection = await until(() => {
    if (proc.exitCode !== null) throw Error(log);
    const f = path.join(root, ".editor/connection.json");
    return fs.existsSync(f) && JSON.parse(fs.readFileSync(f, "utf8"));
  });
  return {
    proc,
    connection,
    stop: async () => {
      proc.kill("SIGTERM");
      await new Promise((resolve) => proc.once("exit", resolve));
    },
  };
};
test("trim/source clocks, frame bounds, split and opaque data", () => {
  const p = clean(),
    c = p.clips[0];
  assert.equal(dragClip(p, c, "left", -10).in, 0);
  assert.equal(dragClip(p, c, "right", 100).duration, 8);
  const result = splitClip(p, c.id, 2);
  assert.equal(result.clips[0].duration, 2);
  assert.equal(result.clips.at(-1).in, 2);
  assert.deepEqual(result.notes, p.notes);
  assert.throws(
    () => validate({ ...p, clips: [{ ...c, duration: 9 }] }),
    /source handles/,
  );
  assert.throws(() => validate({ ...p, clips: [{ ...c, start: NaN }] }));
});
test("punch-ins can crop the canvas while invisible and excessive transforms reject", () => {
  const p = clean(),
    c = p.clips[0];
  const zoom = {
    ...c,
    x: -p.width * 0.06,
    y: -p.height * 0.06,
    width: p.width * 1.12,
    height: p.height * 1.12,
  };
  assert.doesNotThrow(() => validate({ ...p, clips: [zoom] }));
  for (const patch of [
    { x: -zoom.width },
    { x: p.width },
    { y: -zoom.height },
    { width: p.width * 4.01 },
    { x: Infinity },
  ]) {
    assert.throws(
      () => validate({ ...p, clips: [{ ...zoom, ...patch }] }),
      /Clip rectangle/,
    );
  }
});
test("service revisions, file recovery, persisted history, security, media and jobs", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "editor-core-"));
  fs.cpSync(path.join(fixture, "media"), path.join(root, "media"), {
    recursive: true,
  });
  fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(clean()));
  let server = await start(root);
  let conn = server.connection;
  const call = async (route, body, status = 200) => {
    const r = await fetch(conn.url + "/api/" + route, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${conn.token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal(r.status, status, await r.clone().text());
    return r.json();
  };
  try {
    assert.equal((await fetch(conn.url + "/api/state")).status, 401);
    assert.equal(
      (
        await fetch(conn.url + "/api/state", {
          headers: {
            Authorization: `Bearer ${conn.token}`,
            Origin: "https://untrusted.example",
          },
        })
      ).status,
      403,
    );
    let s = await call("state");
    assert.equal(s.project.revision, 0);
    await call("clip", { revision: 0, id: "opening", patch: { duration: 3 } });
    await call(
      "clip",
      { revision: 0, id: "opening", patch: { duration: 2 } },
      409,
    );
    s = await call("state");
    assert.equal(s.project.clips[0].duration, 3);
    assert.deepEqual(s.project.notes, demo.notes);
    await call("undo", { revision: 1 });
    s = await call("state");
    assert.equal(s.project.clips[0].duration, 4);
    await call("redo", { revision: 2 });
    s = await call("state");
    assert.equal(s.project.clips[0].duration, 3);
    fs.writeFileSync(path.join(root, "project.json"), "{partial");
    s = await call("state");
    assert.match(s.error, /JSON|property/i);
    assert.equal(s.project.revision, 3);
    await call(
      "clip",
      { revision: 3, id: "opening", patch: { duration: 2 } },
      409,
    );
    assert.equal(
      fs.readFileSync(path.join(root, "project.json"), "utf8"),
      "{partial",
    );
    const external = structuredClone(s.project);
    external.clips[0].name = "Agent changed this";
    fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(external));
    s = await call("state");
    assert.equal(s.project.revision, 4);
    assert.equal(s.project.clips[0].name, "Agent changed this");
    fs.writeFileSync(
      path.join(root, "project.json"),
      JSON.stringify({ ...external, revision: 0 }),
    );
    s = await call("state");
    assert.match(s.error, /stale/);
    assert.equal(s.project.revision, 4);
    fs.writeFileSync(
      path.join(root, "project.json"),
      JSON.stringify(s.project),
    );
    s = await call("state");
    assert.equal(s.error, "");
    await call("tool", { revision: 4, name: "add-card" });
    s = await call("state");
    assert.equal(s.project.clips.length, 5);
    assert.ok(s.boxes[s.project.clips.at(-1).id]);
    const range = await fetch(
      conn.url + "/api/media?id=take-a&token=" + conn.token,
      { headers: { Range: "bytes=0-31" } },
    );
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 32);
    const badRange = await fetch(
      conn.url + "/api/media?id=take-a&token=" + conn.token,
      { headers: { Range: "bytes=9999999999-" } },
    );
    assert.equal(badRange.status, 416);
    fs.symlinkSync(
      fixture,
      path.join(root, "media", "outside"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const bad = structuredClone(s.project);
    bad.assets[0].path = "media/outside/media/take-a.mp4";
    await call("project", { revision: 5, project: bad });
    const denied = await fetch(
      conn.url + "/api/media?id=take-a&token=" + conn.token,
    );
    assert.equal(denied.status, 400);
    await call("undo", { revision: 6 });
    const job = await call("render", { revision: 7 });
    assert.equal(job.revision, 7);
    await call("clip", {
      revision: 7,
      id: "opening",
      patch: { name: "New edit during render" },
    });
    const finished = await until(async () => {
      const state = await call("state");
      return state.jobs.find((j) => j.id === job.id && j.status !== "running");
    });
    assert.equal(finished.status, "complete", finished.error);
    assert.equal(finished.revision, 7);
    const output = path.join(root, finished.artifact);
    const probe = JSON.parse(
      execFileSync(
        process.env.FFPROBE || "ffprobe",
        ["-v", "error", "-show_format", "-show_streams", "-of", "json", output],
        { encoding: "utf8" },
      ),
    );
    assert.equal(
      probe.streams.filter((s) => s.codec_type === "video").length,
      1,
    );
    assert.equal(
      probe.streams.filter((s) => s.codec_type === "audio").length,
      1,
    );
    assert.ok(Math.abs(Number(probe.format.duration) - 8) < 0.15);
    const pixel = execFileSync(process.env.FFMPEG || "ffmpeg", [
      "-v",
      "error",
      "-ss",
      "2",
      "-i",
      output,
      "-vf",
      "crop=2:2:50:80",
      "-frames:v",
      "1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ]);
    assert.ok(
      pixel[0] > 180 && pixel[1] > 220 && pixel[2] < 110,
      `Expected lime extension graphic, got ${pixel.subarray(0, 3)}`,
    );
    const cancel = await call("render", { revision: 8 });
    await call("cancel", { id: cancel.id });
    await until(async () => {
      const state = await call("state");
      return state.jobs.find(
        (j) => j.id === cancel.id && j.status === "cancelled",
      );
    });
    await server.stop();
    server = await start(root);
    conn = server.connection;
    s = await call("state");
    assert.equal(s.project.revision, 8);
    assert.equal(s.canUndo, true);
    assert.ok(s.jobs.some((j) => j.id === job.id && j.artifact));
    await call("undo", { revision: 8 });
    s = await call("state");
    assert.equal(s.project.clips[0].name, "Agent changed this");
    const original = path.join(root, "media/take-a.mp4"),
      hash = () =>
        createHash("sha256").update(fs.readFileSync(original)).digest("hex"),
      before = hash();
    execFileSync(process.execPath, [
      "scripts/import.mjs",
      "--workspace",
      root,
      "--source",
      original,
    ]);
    s = await call("state");
    assert.equal(s.project.assets.length, 3);
    assert.equal(hash(), before);
    assert.equal(s.project.assets.at(-1).audio, true);
    const base = s.project.revision;
    const commented = await call("comment", {
      revision: base,
      body: "Persistent feedback",
      anchor: { type: "clip", clipId: "opening", sourceTime: 1 },
    });
    await call(
      "comment",
      {
        revision: base,
        body: "Stale feedback",
        anchor: { type: "timeline", time: 0 },
      },
      409,
    );
    const note = commented.comments[0];
    await call("comment-update", {
      revision: commented.revision,
      id: note.id,
      patch: { status: "resolved" },
    });
    await server.stop();
    server = await start(root);
    conn = server.connection;
    s = await call("state");
    assert.equal(s.project.comments[0].status, "resolved");
    assert.equal(s.project.comments[0].body, "Persistent feedback");
    await call("undo", { revision: s.project.revision });
    s = await call("state");
    assert.equal(s.project.comments[0].status, "open");
    const unknown = structuredClone(s.project);
    unknown.clips[0].kind = "uninstalled-widget";
    const preserved = await call("project", {
      revision: s.project.revision,
      project: unknown,
    });
    assert.equal(preserved.clips[0].kind, "uninstalled-widget");
    await call("render", { revision: preserved.revision }, 400);
  } finally {
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("source previews decode real frames/audio, cache across restart, and handle silent or missing assets", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "editor-preview-"));
  fs.cpSync(path.join(fixture, "media"), path.join(root, "media"), {
    recursive: true,
  });
  const p = clean();
  const asset = p.assets[0];
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    path.join(root, asset.path),
    "-an",
    "-c:v",
    "copy",
    path.join(root, "media/silent.mp4"),
  ]);
  p.assets.push({
    ...asset,
    id: "silent",
    path: "media/silent.mp4",
    audio: false,
  });
  p.assets.push({ ...asset, id: "missing", path: "media/missing.mp4" });
  fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(p));
  let server = await start(root);
  const request = async (id) => {
    const { url, token } = server.connection;
    return fetch(`${url}/api/media-preview?id=${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  };
  try {
    assert.equal(
      (await fetch(server.connection.url + "/api/media-preview?id=" + asset.id))
        .status,
      401,
    );
    assert.equal((await request("unknown")).status, 404);
    const [a, b] = await Promise.all([request(asset.id), request(asset.id)]);
    const data = await a.json();
    assert.deepEqual(data, await b.json());
    assert.deepEqual(data.errors, []);
    assert.match(data.sprite, /^data:image\/jpeg;base64,/);
    assert.equal(data.count, 8);
    assert.equal(data.peaks.length, 800);
    assert.ok(data.peaks.some((p) => p > 0));
    assert.ok(data.peaks.every((p) => p >= 0 && p <= 1));
    const files = fs.readdirSync(path.join(root, ".editor/media-previews"));
    assert.equal(files.length, 1);
    const cacheFile = path.join(root, ".editor/media-previews", files[0]);
    const mtime = fs.statSync(cacheFile).mtimeMs;
    await server.stop();
    server = await start(root);
    assert.deepEqual(await (await request(asset.id)).json(), data);
    assert.equal(fs.statSync(cacheFile).mtimeMs, mtime);
    const silent = await (await request("silent")).json();
    assert.deepEqual(silent.errors, []);
    assert.ok(silent.sprite);
    assert.equal(silent.peaks, undefined);
    assert.equal((await request("missing")).status, 400);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, "project.json"))).revision,
      0,
    );
  } finally {
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("layer controls preserve clips, validate flags, persist, undo and render silence/disabled video", async () => {
  const { patchLayer } = await import("../dist/model.mjs");
  const p = clean();
  p.layers = { 0: { custom: { retained: true } } };
  const clips = structuredClone(p.clips);
  patchLayer(p, 0, { muted: true });
  assert.deepEqual(p.clips, clips);
  assert.deepEqual(p.layers[0].custom, { retained: true });
  for (const layers of [
    [],
    { 8: {} },
    { 0: null },
    { 0: { muted: "yes" } },
    { 1: { disabled: 1 } },
  ])
    assert.throws(() => validate({ ...p, layers }));
  assert.throws(() => patchLayer(clean(), -1, { muted: true }));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "editor-layers-"));
  fs.cpSync(path.join(fixture, "media"), path.join(root, "media"), {
    recursive: true,
  });
  fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(clean()));
  let server = await start(root);
  const call = async (route, body, status = 200) => {
    const r = await fetch(server.connection.url + "/api/" + route, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${server.connection.token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal(r.status, status, await r.clone().text());
    return r.json();
  };
  try {
    await call("layer", { revision: 0, track: 0, patch: { muted: true } });
    await call(
      "layer",
      { revision: 0, track: 0, patch: { muted: false } },
      409,
    );
    await call(
      "layer",
      { revision: 1, track: 0, patch: { muted: "yes" } },
      400,
    );
    assert.deepEqual((await call("state")).project.clips, clean().clips);
    const render = async () => {
      const state = await call("state");
      const job = await call("render", { revision: state.project.revision });
      const done = await until(async () =>
        (await call("state")).jobs.find(
          (j) => j.id === job.id && j.status !== "running",
        ),
      );
      assert.equal(done.status, "complete", done.log);
      return path.join(root, done.artifact);
    };
    const mutedFile = await render();
    const probe = JSON.parse(
      execFileSync(
        process.env.FFPROBE || "ffprobe",
        ["-v", "error", "-show_streams", "-of", "json", mutedFile],
        { encoding: "utf8" },
      ),
    );
    assert.equal(
      probe.streams.filter((s) => s.codec_type === "audio").length,
      0,
    );
    await server.stop();
    server = await start(root);
    assert.equal((await call("state")).project.layers[0].muted, true);
    await call("undo", { revision: 1 });
    assert.equal((await call("state")).project.layers, undefined);
    for (const track of [0, 1, 2]) {
      const state = await call("state");
      await call("layer", {
        revision: state.project.revision,
        track,
        patch: { disabled: true },
      });
    }
    const disabledFile = await render();
    const pixel = execFileSync(process.env.FFMPEG || "ffmpeg", [
      "-v",
      "error",
      "-i",
      disabledFile,
      "-frames:v",
      "1",
      "-vf",
      "scale=1:1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ]);
    assert.ok(
      [...pixel].every((v) => v < 5),
      `Disabled layers should render black: ${pixel}`,
    );
  } finally {
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("section take preferences preserve unequal ranges and independent choices", () => {
  const p = clean();
  p.takeSections = ["intro", "outro"].map((id) => ({
    id,
    label: id,
    assetId: p.assets[0].id,
    takes: [
      { id: "a", label: "A", sourceStart: 0, sourceEnd: 1 },
      { id: "b", label: "B", sourceStart: 1, sourceEnd: 3 },
    ],
  }));
  const clips = structuredClone(p.clips);
  chooseTake(p, "intro", "b");
  chooseTake(p, "outro", "a");
  assert.equal(p.takeSections[0].preferredTakeId, "b");
  assert.equal(p.takeSections[1].preferredTakeId, "a");
  assert.deepEqual(p.clips, clips);
  assert.equal(p.takeSections[0].takes[1].sourceEnd, 3);
  assert.throws(() => chooseTake(p, "intro", "missing"));
  p.takeSections[0].takes[0].sourceEnd = 9999;
  assert.throws(() => validate(p));
});

test("portrait HD canvases work and oversized squares remain rejected", () => {
  const p = clean();
  p.width = 720;
  p.height = 1280;
  p.clips = [];
  assert.equal(validate(p).height, 1280);
  p.width = 1080;
  p.height = 1920;
  assert.equal(validate(p).height, 1920);
  p.width = 1280;
  assert.throws(() => validate(p), /canvas dimensions/);
});

test("empty projects create timed graphics layers with revisions, source validation, split and undo", async () => {
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-graphics-core-"),
  );
  const p = { ...clean(), assets: [], clips: [], comments: [] };
  fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(p));
  let server;
  try {
    server = await start(root);
    const call = async (action, body, status = 200) => {
      const r = await fetch(server.connection.url + "/api/" + action, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + server.connection.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, status, await r.clone().text());
      return r.json();
    };
    await call(
      "add-graphics",
      { revision: 0, source: "../outside.dart", duration: 10 },
      400,
    );
    await call("add-graphics", {
      revision: 0,
      source: "lib/paper.dart",
      name: "Paper",
      duration: 10,
      track: 0,
    });
    await call(
      "add-graphics",
      { revision: 0, source: "lib/badge.dart", duration: 10, track: 1 },
      409,
    );
    await call("add-graphics", {
      revision: 1,
      source: "lib/badge.dart",
      name: "Badge",
      duration: 10,
      track: 1,
    });
    let doc = JSON.parse(fs.readFileSync(path.join(root, "project.json")));
    assert.equal(doc.clips.length, 2);
    assert.deepEqual(
      doc.clips.map((c) => c.track),
      [0, 1],
    );
    assert.equal(Math.max(...doc.clips.map((c) => c.start + c.duration)), 10);
    assert.equal(doc.assets.length, 0);
    const badge = doc.clips[1];
    await call("split", { revision: 2, id: badge.id, time: 4 });
    doc = JSON.parse(fs.readFileSync(path.join(root, "project.json")));
    const second = doc.clips.find((c) => c.start === 4);
    assert.equal(second.in, 4);
    assert.equal(second.props.source, "lib/badge.dart");
    await call("undo", { revision: 3 });
    doc = JSON.parse(fs.readFileSync(path.join(root, "project.json")));
    assert.equal(doc.clips.length, 2);
    await call('selection', {clipId: badge.id, time: 7.5});
    await call('selection', {time: -1}, 400);
    await server.stop();
    server = await start(root);
    const restored = await fetch(server.connection.url + '/api/state', {headers:{Authorization:'Bearer '+server.connection.token}}).then(r=>r.json());
    assert.deepEqual(restored.selection, {clipId: badge.id, time:7.5});
    assert.equal(restored.project.revision, doc.revision);
  } finally {
    await server?.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
