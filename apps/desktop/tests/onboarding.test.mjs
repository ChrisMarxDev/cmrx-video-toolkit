import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { startApp } from "../src/server.mjs";
import { ProjectLibrary } from "../src/project-library.mjs";
const folder = () =>
  fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "cmrx-first-video-",
    ),
  );
const post = (app, route, body = {}) =>
  fetch(app.url + "/chat/" + route, {
    method: "POST",
    headers: { Authorization: "Bearer " + app.token },
    body: JSON.stringify(body),
  });
test("project folders preserve unrelated files and reopen a stable recent entry", () => {
  const root = folder();
  try {
    const project = path.join(root, "My first film");
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, "notes.txt"), "user notes");
    const library = new ProjectLibrary(path.join(root, "settings"));
    const a = library.open(project);
    assert.equal(a.workspace, path.join(project, ".cmrx-editor"));
    fs.writeFileSync(path.join(a.workspace, "project.json"), "{}");
    const b = library.recent(a.id);
    assert.equal(a.id, b.id);
    assert.equal(library.list().length, 1);
    assert.equal(
      fs.readFileSync(path.join(project, "notes.txt"), "utf8"),
      "user notes",
    );
    assert.equal(
      new ProjectLibrary(path.join(root, "settings")).list()[0].folder,
      project,
    );
    assert.throws(() => library.recent("missing"), /no longer available/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("first-video flow validates onboarding, preserves portrait HD bytes and persists completion", async () => {
  const root = folder(),
    workspace = path.join(root, "project"),
    source = path.join(root, "portrait.mp4");
  let app;
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=purple:s=720x1280:r=30:d=1",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-pix_fmt",
    "yuv420p",
    source,
  ]);
  const original = fs.readFileSync(source);
  const providerFactory = () => ({
    async start() {},
    async account() {
      return { connected: true };
    },
    close() {},
  });
  try {
    app = await startApp({
      workspace,
      pickVideo: async () => source,
      providerFactory,
    });
    assert.equal(
      (await post(app, "onboarding", { complete: true })).status,
      400,
    );
    await post(app, "login", { provider: "chatgpt" });
    const imported = await (await post(app, "import")).json();
    assert.equal(imported.exactCopy, true);
    const project = (await app.editor("/api/state")).project;
    assert.equal(project.width, 720);
    assert.equal(project.height, 1280);
    assert.equal(project.fps, 30);
    assert.deepEqual(
      fs.readFileSync(path.join(workspace, project.assets[0].path)),
      original,
    );
    assert.deepEqual(fs.readFileSync(source), original);
    assert.equal(project.assets[0].provenance.playback, "Exact source copy");
    assert.equal(
      (await post(app, "onboarding", { complete: true })).status,
      200,
    );
    await app.close();
    app = await startApp({ workspace, providerFactory });
    const s = await (await post(app, "settings")).json();
    assert(s.providers.every((p) => !p.connected));
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(workspace, ".editor/onboarding.json")),
      ).complete,
      true,
    );
  } finally {
    await app?.close();
    await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("review-only onboarding and canceled folder/video pickers leave the project intact", async () => {
  const root = folder();
  let app;
  try {
    app = await startApp({
      workspace: root,
      providerFactory: () => {
        throw Error("Must not start a provider");
      },
      pickVideo: async () => null,
      pickProject: async () => ({ canceled: true }),
    });
    const before = fs.readFileSync(path.join(root, "project.json"), "utf8");
    assert.equal((await (await post(app, "project")).json()).canceled, true);
    assert.equal((await post(app, "import")).status, 200);
    assert.equal(
      fs.readFileSync(path.join(root, "project.json"), "utf8"),
      before,
    );
    assert.equal(
      (await post(app, "onboarding", { skipProvider: true })).status,
      200,
    );
    assert.equal(
      (await post(app, "onboarding", { complete: true })).status,
      400,
    );
  } finally {
    await app?.close();
    await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("opening a desktop project never runs legacy host extension workers", async () => {
  const root = folder();
  let app;
  try {
    const ext = path.join(root, "extensions", "unexpected");
    fs.mkdirSync(ext, { recursive: true });
    const sentinel = path.join(root, "executed.txt");
    fs.writeFileSync(
      path.join(ext, "extension.json"),
      JSON.stringify({ apiVersion: 1, id: "unexpected", worker: "worker.mjs" }),
    );
    fs.writeFileSync(
      path.join(ext, "worker.mjs"),
      `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(sentinel)},'executed');`,
    );
    app = await startApp({
      workspace: root,
      providerFactory: () => ({ async start() {}, close() {} }),
    });
    assert.equal(fs.existsSync(sentinel), false);
    assert.deepEqual((await app.editor("/api/state")).extensions, []);
  } finally {
    await app?.close();
    await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("script-first projects finish setup without media and retain authored scripts after reopening", async () => {
  const root = folder();
  let app;
  try {
    app = await startApp({
      workspace: root,
      providerFactory: () => ({ async start() {}, close() {} }),
    });
    assert.equal(
      (await post(app, "onboarding", { complete: true, withoutVideo: true }))
        .status,
      400,
    );
    await post(app, "onboarding", { skipProvider: true });
    assert.equal(
      (await post(app, "onboarding", { complete: true, withoutVideo: true }))
        .status,
      200,
    );
    assert.equal((await app.editor("/api/context")).project.clips.length, 0);
    const fingerprint = app.playground.fingerprint();
    app.playground.write("script.md", "# jev_video\n\nFirst draft.\n");
    assert.equal(app.playground.fingerprint(), fingerprint);
    await app.close();
    app = await startApp({
      workspace: root,
      providerFactory: () => ({ async start() {}, close() {} }),
    });
    assert.equal(
      app.playground.read("script.md"),
      "# jev_video\n\nFirst draft.\n",
    );
    assert(app.playground.files().includes("script.md"));
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, ".editor/onboarding.json")))
        .complete,
      true,
    );
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("conversion preserves portrait shape, later landscape footage fits, and originals stay untouched", async () => {
  const root = folder(),
    portrait = path.join(root, "portrait.mov"),
    wide = path.join(root, "wide.mp4");
  let app,
    picked = portrait;
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=purple:s=720x1280:r=30:d=1",
    "-c:v",
    "mpeg4",
    "-threads",
    "1",
    portrait,
  ]);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=1280x720:r=30:d=1",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-pix_fmt",
    "yuv420p",
    wide,
  ]);
  const original = fs.readFileSync(portrait);
  try {
    app = await startApp({
      workspace: path.join(root, "project"),
      pickVideo: async () => picked,
      providerFactory: () => ({ async start() {}, close() {} }),
    });
    const a = await (await post(app, "import")).json();
    assert.equal(a.exactCopy, false);
    assert.deepEqual([a.width, a.height], [720, 1280]);
    assert.deepEqual(fs.readFileSync(portrait), original);
    picked = wide;
    assert.equal((await post(app, "import")).status, 200);
    const project = (await app.editor("/api/state")).project;
    assert.deepEqual([project.width, project.height], [720, 1280]);
    const clip = project.clips[1];
    assert.equal(clip.width, 720);
    assert.equal(clip.height, 405);
    assert.equal(clip.y, 437.5);
  } finally {
    await app?.close();
    await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("canceling an import before file selection releases ownership without changing the project", async () => {
  const root = folder();
  let app, release, entered;
  const waiting = new Promise((r) => (entered = r));
  try {
    app = await startApp({
      workspace: root,
      providerFactory: () => ({ async start() {}, close() {} }),
      pickVideo: async () => {
        entered();
        return new Promise((r) => (release = r));
      },
    });
    const original = fs.readFileSync(path.join(root, "project.json"), "utf8");
    const importing = post(app, "import");
    await waiting;
    await post(app, "stop");
    release(path.join(root, "nonexistent.mp4"));
    const result = await (await importing).json();
    assert.equal(result.canceled, true);
    assert.equal(
      fs.readFileSync(path.join(root, "project.json"), "utf8"),
      original,
    );
    const state = await (await post(app, "state")).json();
    assert.equal(state.importing, false);
    assert.equal(state.locked, false);
  } finally {
    release?.(null);
    await app?.close();
    await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a stale desktop workspace lock recovers, while a live owner stays protected", async () => {
  const root = folder();
  let app;
  try {
    app = await startApp({
      workspace: root,
      providerFactory: () => ({ async start() {}, close() {} }),
    });
    const before = fs.readFileSync(path.join(root, "project.json"), "utf8");
    await assert.rejects(
      startApp({
        workspace: root,
        providerFactory: () => ({ async start() {}, close() {} }),
      }),
      /open in another window/,
    );
    await app.close();
    app = null;
    const lock = path.join(root, ".editor/server.lock");
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, "pid"), "99999999");
    app = await startApp({
      workspace: root,
      providerFactory: () => ({ async start() {}, close() {} }),
    });
    assert.equal(
      fs.readFileSync(path.join(root, "project.json"), "utf8"),
      before,
    );
    assert.notEqual(
      fs.readFileSync(path.join(lock, "pid"), "utf8"),
      "99999999",
    );
  } finally {
    await app?.close();
    await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
