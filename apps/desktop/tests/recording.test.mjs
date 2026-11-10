import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { RecordingStore, recoverRecordings } from "../src/recording-store.mjs";
import { AssetLibrary } from "../src/asset-library.mjs";
import { startApp } from "../src/server.mjs";
const root = fs.mkdtempSync(
  path.join(os.homedir(), ".cache/cmrx-recording-tests-"),
);
after(() => fs.rmSync(root, { recursive: true, force: true }));
function workspace() {
  return fs.mkdtempSync(path.join(root, "project-"));
}
const ff = (name, args) => {
  const file = path.join(root, name);
  execFileSync("ffmpeg", ["-v", "error", ...args, file]);
  return fs.readFileSync(file);
};
const video = ff("screen.webm", [
  "-f",
  "lavfi",
  "-i",
  "color=c=red:s=320x180:r=15:d=1",
  "-c:v",
  "libvpx",
  "-threads",
  "1",
]);
const audio = ff("microphone.webm", [
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=1",
  "-c:a",
  "libopus",
]);
test("separate captured tracks publish one portable asset bundle with source clocks and playable media", async () => {
  const project = workspace(),
    store = new RecordingStore(project);
  await store.start([
    { name: "screen", mime: "video/webm" },
    { name: "camera", mime: "video/webm" },
    { name: "microphone", mime: "audio/webm" },
  ]);
  await Promise.all([
    store.write("screen", video.subarray(0, 100)),
    store.write("screen", video.subarray(100)),
    store.write("camera", video),
    store.write("microphone", audio),
  ]);
  assert(!fs.existsSync(path.join(project, "assets/recordings", store.id)));
  const result = await store.finish({ screen: 0, camera: 12, microphone: 4 });
  const manifest = JSON.parse(
    fs.readFileSync(path.join(result.folder, "manifest.json")),
  );
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.tracks.length, 3);
  assert.equal(manifest.tracks[1].offsetMs, 12);
  assert(manifest.tracks.every((t) => t.media.duration > 0));
  assert(!fs.existsSync(path.join(result.folder, "screen.webm.partial")));
  assert.equal(
    fs.existsSync(path.join(project, "project.json")),
    false,
    "recording never creates timeline edits",
  );
  const assets = new AssetLibrary({
    workspace: project,
    root: path.join(project, ".profile"),
  });
  const bundle = assets.list({ scope: "project", folder: "recordings" })
    .items[0];
  assert.equal(bundle.bundle, true);
  assert.equal(bundle.preview.type, "video");
  assert(!bundle.error);
  assert(!bundle.instructionError);
  assert.deepEqual(await store.finish(), {
    folder: result.folder,
    id: store.id,
  });
});
test("recording rejects unexpected track IDs and keeps interrupted/failed capture bytes", async () => {
  const store = new RecordingStore(workspace());
  await assert.rejects(
    store.start([{ name: "../escape", mime: "video/webm" }]),
  );
  await store.start([{ name: "camera", mime: "video/webm" }]);
  await assert.rejects(store.write("screen", video));
  await store.write("camera", Buffer.from("truncated media"));
  await assert.rejects(store.finish(), /retained/);
  assert.equal(store.status, "interrupted");
  assert(fs.existsSync(path.join(store.folder, "camera.webm.partial")));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(store.folder, "manifest.json")))
      .status,
    "interrupted",
  );
});
test("interruption retains data; project recording paths cannot follow symlinked assets", async () => {
  const project = workspace(),
    store = new RecordingStore(project);
  await store.start([{ name: "screen", mime: "video/webm" }]);
  await store.write("screen", video);
  await store.interrupt("Renderer stopped");
  assert.equal(store.status, "interrupted");
  assert(fs.existsSync(path.join(store.folder, "screen.webm.partial")));
  const outside = workspace();
  fs.symlinkSync(outside, path.join(project, "assets"));
  await assert.rejects(store.finish(), /retained/);
  assert(!fs.existsSync(path.join(outside, "recordings")));
});
test("recording entry is authenticated, POST-only and absent from browser-only projects", async () => {
  const project = workspace();
  let opened = 0;
  const app = await startApp({
    workspace: project,
    agentRoot: path.join(project, ".profile"),
    record: () => {
      opened++;
    },
    autoPreview: false,
  });
  try {
    await app.ready;
    assert.equal(
      (await fetch(app.url + "/chat/record", { method: "POST", body: "{}" }))
        .status,
      403,
    );
    assert.equal(opened, 0);
    const headers = { Authorization: "Bearer " + app.token };
    assert((await fetch(app.url + "/chat/record", { headers })).status >= 400);
    assert.equal(opened, 0);
    assert.equal(
      (
        await fetch(app.url + "/chat/record", {
          method: "POST",
          headers,
          body: "{}",
        })
      ).status,
      200,
    );
    assert.equal(opened, 1);
    assert.equal(app.state.canRecord, true);
  } finally {
    await app.close();
  }
});

test("abandoned capture manifests reconcile without deleting partial media", async () => {
  const project = workspace(),
    store = new RecordingStore(project);
  await store.start([{ name: "screen", mime: "video/webm" }]);
  await store.write("screen", video);
  await store.closeTracks();
  const file = path.join(store.folder, "manifest.json"),
    manifest = JSON.parse(fs.readFileSync(file));
  manifest.ownerPid = 2147483647;
  fs.writeFileSync(file, JSON.stringify(manifest));
  assert.deepEqual(recoverRecordings(project), [store.id]);
  assert.equal(JSON.parse(fs.readFileSync(file)).status, "interrupted");
  assert(fs.existsSync(path.join(store.folder, "screen.webm.partial")));
});

test("audio-only sessions publish a playable sound asset rather than a video", async () => {
  const project = workspace(),
    store = new RecordingStore(project);
  await store.start([{ name: "microphone", mime: "audio/webm" }]);
  await store.write("microphone", audio);
  const result = await store.finish();
  const assets = new AssetLibrary({
    workspace: project,
    root: path.join(project, ".profile"),
  });
  const item = assets.list({ scope: "project", folder: "recordings" }).items[0];
  assert.equal(item.type, "audio");
  assert.equal(item.preview.type, "audio");
  assert(!item.error);
  assert(fs.existsSync(path.join(result.folder, "microphone.weba")));
});
