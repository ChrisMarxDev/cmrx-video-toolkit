import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { PlaybackProxies } from "../../local-editor/src/playback-proxy.mjs";
import { startApp } from "../src/server.mjs";
import { importVideo } from "../src/import-video.mjs";
const root = () =>
  fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-playback-proxy-"));
const ff = (args) => execFileSync("ffmpeg", ["-v", "error", ...args]);
const probe = (file) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ]),
  );
const sha = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function footage(file) {
  ff([
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=1080x1920:r=24:d=1.25",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1.25",
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    file,
  ]);
}
function alpha(file) {
  ff([
    "-f",
    "lavfi",
    "-i",
    "color=c=black@0:s=1080x1920:r=24:d=0.5,format=rgba,drawbox=x=0:y=0:w=300:h=300:color=red@1:t=fill:replace=1,format=yuva420p",
    "-c:v",
    "libvpx-vp9",
    "-threads",
    "2",
    "-deadline",
    "realtime",
    "-cpu-used",
    "8",
    "-pix_fmt",
    "yuva420p",
    "-auto-alt-ref",
    "0",
    file,
  ]);
}
test("playback cache preserves timing/audio, deduplicates, reuses receipts and repairs corruption", async () => {
  const dir = root();
  let cache;
  try {
    const source = path.join(dir, "source.mp4");
    footage(source);
    const original = sha(source);
    cache = new PlaybackProxies(path.join(dir, "cache"));
    const entry = cache.request(source, "720");
    assert.equal(entry.status, "preparing");
    assert.equal(cache.request(source, "720"), entry);
    await cache.queue;
    assert.equal(entry.status, "ready", entry.error);
    assert.deepEqual([entry.width, entry.height], [720, 1280]);
    const output = probe(entry.file);
    const video = output.streams.find((s) => s.codec_type === "video");
    assert.equal(video.nb_frames, "30");
    assert.equal(video.avg_frame_rate, "24/1");
    assert.equal(Number(video.duration), 1.25);
    // AAC encoder padding can extend the container by up to one audio frame.
    const audio = output.streams.find((s) => s.codec_type === "audio");
    const padding = 1024 / Number(audio.sample_rate);
    assert(Math.abs(Number(output.format.duration) - 1.25) <= padding);
    assert(output.streams.some((s) => s.codec_type === "audio"));
    await cache.close();
    cache = new PlaybackProxies(path.join(dir, "cache"));
    assert.equal(cache.request(source, "720").status, "ready");
    fs.writeFileSync(entry.file, "broken");
    const repair = cache.request(source, "720");
    assert.equal(repair.status, "preparing");
    await cache.queue;
    assert.equal(repair.status, "ready");
    assert.equal(probe(repair.file).streams[0].width, 720);
    const full = cache.request(source, "1080");
    await cache.queue;
    assert.equal(full.original, true);
    assert.equal(full.file, source);
    assert.equal(sha(source), original);
    assert.throws(() => cache.request(source, "4k"), /quality/);
    fs.utimesSync(source, new Date(), new Date(Date.now() + 2000));
    assert.notEqual(cache.request(source, "720").key, entry.key);
    await cache.queue;
  } finally {
    await cache?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("transparent preview resizing retains real alpha and frame rate", async () => {
  const dir = root();
  const cache = new PlaybackProxies(path.join(dir, "cache"));
  try {
    const source = path.join(dir, "overlay.webm");
    alpha(source);
    const original = sha(source);
    const entry = cache.request(source, "720", true);
    await cache.queue;
    assert.equal(entry.status, "ready", entry.error);
    const bytes = ff([
      "-c:v",
      "libvpx-vp9",
      "-i",
      entry.file,
      "-frames:v",
      "1",
      "-vf",
      "alphaextract",
      "-pix_fmt",
      "gray",
      "-f",
      "rawvideo",
      "pipe:1",
    ]);
    assert(bytes[10 * 720 + 10] > 240, "Opaque graphic disappeared");
    assert.equal(bytes[700 * 720 + 500], 0, "Transparent area became opaque");
    assert.equal(probe(entry.file).streams[0].avg_frame_rate, "24/1");
    assert.equal(sha(source), original);
  } finally {
    await cache.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("proxy endpoints require auth and never change original assets or project edits", async () => {
  const dir = root();
  let app;
  try {
    const source = path.join(dir, "source.mp4");
    footage(source);
    let active = false;
    app = await startApp({
      workspace: path.join(dir, "project"),
      autoPreview: () => active,
    });
    await importVideo({ workspace: app.workspace, source, editor: app.editor });
    const project = (await app.editor("/api/context")).project;
    const before = fs.readFileSync(path.join(app.workspace, "project.json"));
    const asset = project.assets[0];
    const status = "/api/playback-preview?id=" + asset.id + "&quality=720";
    assert.equal((await fetch(app.url + status)).status, 401);
    const fetchPreview = () =>
      fetch(app.url + status + "&token=" + app.editorToken).then((r) =>
        r.json(),
      );
    const deferred = await fetchPreview();
    assert.equal(deferred.deferred,true);
    assert.equal(fs.readdirSync(path.join(app.workspace,".editor/playback-proxies")).length,0);
    active = true;
    let info = await fetchPreview();
    assert.equal(info.status, "preparing");
    for (let i = 0; i < 200 && info.status === "preparing"; i++) {
      await new Promise((r) => setTimeout(r, 30));
      info = await fetchPreview();
    }
    assert.equal(info.status, "ready", JSON.stringify(info));
    assert.equal(info.width, 720);
    assert(!("file" in info));
    const response = await fetch(
      app.url +
        "/api/media?id=" +
        asset.id +
        "&quality=720&token=" +
        app.editorToken,
      { headers: { Range: "bytes=0-31" } },
    );
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 32);
    const originalResponse = await fetch(
      app.url + "/api/media?id=" + asset.id + "&token=" + app.editorToken,
    );
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(await originalResponse.arrayBuffer()))
        .digest("hex"),
      sha(source),
    );
    const job = "fixture";
    const snapshot = path.join(app.workspace, ".editor/playground", job);
    fs.mkdirSync(snapshot);
    alpha(path.join(snapshot, "overlay_track_1.webm"));
    app.playground.jobs.push({
      id: job,
      kind: "export",
      status: "complete",
      overlay: true,
      previewTracks: [1],
    });
    const overlayStatus =
      app.url + "/chat/overlay-preview?id=" + job + "&track=1&quality=720";
    assert.equal((await fetch(overlayStatus)).status, 403);
    const check = () =>
      fetch(overlayStatus + "&token=" + app.token).then((r) => r.json());
    info = await check();
    for (let i = 0; i < 200 && info.status === "preparing"; i++) {
      await new Promise((r) => setTimeout(r, 30));
      info = await check();
    }
    assert.equal(info.status, "ready", JSON.stringify(info));
    const overlayResponse = await fetch(
      app.url +
        "/chat/overlay?id=" +
        job +
        "&track=1&quality=720&token=" +
        app.token,
      { headers: { Range: "bytes=0-15" } },
    );
    assert.equal(overlayResponse.status, 206);
    assert.equal((await overlayResponse.arrayBuffer()).byteLength, 16);
    assert.deepEqual(
      fs.readFileSync(path.join(app.workspace, "project.json")),
      before,
    );
    assert.equal((await app.editor("/api/context")).project.width, 1080);
  } finally {
    await app?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("failed generation falls back cleanly and shutdown removes unfinished outputs", async () => {
  const dir = root();
  const cache = new PlaybackProxies(path.join(dir, "cache"));
  try {
    const source = path.join(dir, "invalid.mp4");
    fs.writeFileSync(source, "not video");
    const result = cache.request(source, "720");
    await cache.queue;
    assert.equal(result.status, "failed");
    assert.match(result.error, /original/);
    assert.equal(fs.readFileSync(source, "utf8"), "not video");
    assert(!fs.readdirSync(cache.root).some((n) => n.includes(".part")));
    footage(path.join(dir, "valid.mp4"));
    cache.request(path.join(dir, "valid.mp4"), "720");
    await cache.close();
    assert(!fs.readdirSync(cache.root).some((n) => n.includes(".part")));
  } finally {
    await cache.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
