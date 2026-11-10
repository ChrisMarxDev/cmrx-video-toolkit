import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Playground } from "../src/playground.mjs";
import { startApp } from "../src/server.mjs";
function folder() {
  return fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "playground-test-",
    ),
  );
}
test("source boundaries, history, freshness and restart reconciliation", async () => {
  const root = folder();
  try {
    fs.writeFileSync(
      path.join(root, "project.json"),
      JSON.stringify({ revision: 0 }),
    );
    const p = new Playground({ workspace: root });
    const original = p.fingerprint();
    p.write("lib/new_graphic.dart", "// arbitrary custom painter");
    assert.notEqual(p.fingerprint(), original);
    assert.equal(p.read("lib/new_graphic.dart"), "// arbitrary custom painter");
    assert.ok(fs.readdirSync(path.join(root, ".editor/source-history")).length);
    for (const name of [
      "../secret",
      "/etc/passwd",
      ".editor/chat.json",
      "media/source.mp4",
      "lib/../../secret",
    ])
      assert.throws(() => p.write(name, "oops"));
    fs.symlinkSync("/etc", path.join(root, "lib/escape"));
    assert.throws(() => p.read("lib/escape/passwd"));
    fs.unlinkSync(path.join(root, "lib/escape"));
    fs.symlinkSync("/etc", path.join(root, "assets"));
    assert.throws(() => p.files());
    assert.doesNotThrow(() => p.state());
    fs.unlinkSync(path.join(root, "assets"));
    const sentinel = path.join(root, "sentinel");
    fs.writeFileSync(sentinel, "untouched");
    fs.symlinkSync(sentinel, path.join(root, "lib/new_graphic.dart.tmp"));
    p.write("lib/new_graphic.dart", "// safe atomic write");
    assert.equal(fs.readFileSync(sentinel, "utf8"), "untouched");
    fs.unlinkSync(path.join(root, "lib/new_graphic.dart.tmp"));
    p.jobs.push({
      id: "old",
      status: "complete",
      fingerprint: p.fingerprint(),
    });
    assert.equal(p.state().preview.stale, false);
    p.write("lib/new_graphic.dart", "// changed");
    assert.equal(p.state().preview.stale, true);
    p.jobs.push({ id: "interrupted", status: "running" });
    p.persist();
    const restored = new Playground({ workspace: root });
    assert.equal(restored.jobs.at(-1).status, "interrupted");
    assert.equal(restored.state().preview.id, "old");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("service owns timeline during agent turn and render; stop releases it", async () => {
  const root = folder();
  let app, emit, tool;
  try {
    app = await startApp({
      workspace: root,
      providerFactory: ({ onEvent, onTool }) => {
        emit = onEvent;
        tool = onTool;
        return {
          async start() {},
          async account() {
            return { connected: true };
          },
          async prompt() {},
          async stop() {
            await onEvent({ type: "complete" });
          },
          close() {},
        };
      },
    });
    await app.ready;
    await fetch(app.url + "/chat/login", {
      method: "POST",
      headers: { Authorization: "Bearer " + app.token },
      body: JSON.stringify({ provider: "chatgpt" }),
    });
    const chat = (action, body = {}) =>
      fetch(app.url + "/chat/" + action, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + app.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const manual = () =>
      fetch(app.url + "/api/undo", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + app.editorToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ revision: 0 }),
      });
    assert.equal((await chat("send", { text: "make something" })).status, 200);
    const job = { id: "poll", status: "running", kind: "export" };
    app.playground.jobs.push(job);
    const polled = tool("editor_job", { jobId: job.id });
    setTimeout(() => {
      job.status = "complete";
    }, 50);
    assert.deepEqual(await polled, { ...job, error: undefined });
    job.status = "failed";
    job.error = "diagnostic ".repeat(2000);
    const failure = await tool("editor_job", { jobId: job.id });
    assert.equal(failure.error.length, 8000);
    assert.equal(failure.project, undefined);
    await assert.rejects(tool("editor_job", { jobId: "missing" }), /not found/);
    assert.equal((await manual()).status, 423);
    assert.equal((await chat("import")).status, 400);
    assert.equal((await chat("render")).status, 400);
    assert.equal((await chat("send", { text: "second turn" })).status, 200);
    assert.equal((await manual()).status, 423);
    await chat("stop");
    assert.notEqual((await manual()).status, 423);
    const dir = path.join(root, ".editor/playground/transport");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "preview.mp4"),
      Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    );
    app.playground.jobs.push({
      id: "transport",
      status: "complete",
      fingerprint: app.playground.fingerprint(),
    });
    const partial = await fetch(app.url + "/chat/artifact?id=transport", {
      headers: { Authorization: "Bearer " + app.token, Range: "bytes=2-5" },
    });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get("Content-Range"), "bytes 2-5/10");
    assert.deepEqual(
      Buffer.from(await partial.arrayBuffer()),
      Buffer.from([2, 3, 4, 5]),
    );
    assert.equal(
      (
        await fetch(app.url + "/chat/artifact?id=transport", {
          headers: { Authorization: "Bearer " + app.token, Range: "bytes=99-" },
        })
      ).status,
      416,
    );
    app.playground.jobs.push({ id: "fake-render", status: "running" });
    assert.equal((await manual()).status, 423);
    await emit({ type: "complete" });
    assert.equal((await manual()).status, 423);
    app.playground.jobs.at(-1).kind = "overlay";
    assert.notEqual((await manual()).status, 423); // cache refresh must not freeze live cuts
    app.playground.jobs.at(-1).status = "failed";
    assert.notEqual((await manual()).status, 423);
  } finally {
    await app?.close();
    await new Promise((r) => setTimeout(r, 150));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("review comments and revision-only updates keep previews fresh; content changes invalidate them", async () => {
  const root = folder();
  try {
    const project = {
      revision: 0,
      width: 1080,
      height: 1920,
      clips: [],
      comments: [],
    };
    const write = () =>
      fs.writeFileSync(
        path.join(root, "project.json"),
        JSON.stringify(project, null, 2),
      );
    write();
    const playground = new Playground({ workspace: root });
    playground.write("lib/graphics.dart", "// authored graphics");
    const fingerprint = playground.fingerprint();
    playground.jobs.push({
      id: "reviewed",
      kind: "export",
      status: "complete",
      overlay: true,
      fingerprint,
    });
    project.revision++;
    project.comments.push({
      id: "note",
      body: "Make title larger",
      status: "open",
    });
    write();
    assert.equal(playground.state().overlay.stale, false);
    project.comments[0].status = "resolved";
    project.revision++;
    write();
    assert.equal(playground.state().preview.stale, false);
    project.width = 2160;
    project.height = 3840;
    write();
    assert.notEqual(playground.fingerprint(), fingerprint);
    project.width = 1080;
    project.height = 1920;
    project.clips.push({ duration: 4.8 });
    write();
    assert.notEqual(playground.fingerprint(), fingerprint);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("legacy render receipts migrate only when snapshot content and authored source match", () => {
  const root = folder();
  try {
    const file = path.join(root, "project.json");
    const project = { revision: 0, width: 1080, height: 1920, clips: [] };
    fs.writeFileSync(file, JSON.stringify(project, null, 2));
    const p = new Playground({ workspace: root });
    const legacyProject = fs.readFileSync(file);
    const fingerprint = p.fingerprint({ legacyProject });
    const snapshot = path.join(root, ".editor/playground/legacy");
    fs.mkdirSync(snapshot);
    fs.writeFileSync(path.join(snapshot, "project.json"), legacyProject);
    p.jobs.push({
      id: "legacy",
      kind: "export",
      status: "complete",
      fingerprint,
    });
    p.persist();
    project.revision = 1;
    project.comments = [{ status: "resolved" }];
    fs.writeFileSync(file, JSON.stringify(project, null, 2));
    assert.equal(
      new Playground({ workspace: root }).state().preview.stale,
      false,
    );
    p.jobs[0].fingerprint = fingerprint;
    p.persist();
    p.write("lib/graphics.dart", "// different authored source");
    assert.equal(
      new Playground({ workspace: root }).state().preview.stale,
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stock compositions upgrade clip gain support without rewriting custom authoring", () => {
  const root = folder();
  try {
    fs.writeFileSync(path.join(root, "project.json"), '{"revision":0}');
    new Playground({ workspace: root });
    const file = path.join(root, "lib/composition.dart");
    const stock = fs.readFileSync(file, "utf8");
    const old = stock.replace(
      "ClipAudio.included(volume: (c['volume'] as num? ?? 1).toDouble())",
      "const ClipAudio.included()",
    );
    assert.notEqual(old, stock);
    fs.writeFileSync(file, old);
    new Playground({ workspace: root });
    assert.equal(fs.readFileSync(file, "utf8"), stock);
    fs.writeFileSync(file, old + "\n// custom authoring");
    new Playground({ workspace: root });
    assert.equal(fs.readFileSync(file, "utf8"), old + "\n// custom authoring");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("inactive desktop projects defer automatic preview work until activated", async () => {
  const root = folder();
  let app;
  let active = false;
  let renders = 0;
  try {
    app = await startApp({ workspace: root, autoPreview: () => active });
    app.playground.hasGraphics = () => true;
    app.playground.render = async () => {
      renders++;
      return {};
    };
    await new Promise((resolve) => setTimeout(resolve, 1150));
    assert.equal(renders, 0);
    active = true;
    for (let i = 0; i < 50 && !renders; i++)
      await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(renders, 1);
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
