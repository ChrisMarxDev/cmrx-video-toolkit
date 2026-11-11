import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { startApp } from "../src/server.mjs";
import { importVideo } from "../src/import-video.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.EDITOR_PLAYWRIGHT || "playwright",
);
const root = fs.mkdtempSync(
  path.join(os.homedir(), ".cache/cmrx-preview-quality-ui-"),
);
let app, browser;
const ff = (args) => execFileSync("ffmpeg", ["-v", "error", ...args]);
const hash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
try {
  const source = path.join(root, "source.mp4");
  ff([
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=1440x2560:r=30:d=8",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=8",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-threads",
    "2",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    source,
  ]);
  const workspace = path.join(root, "project");
  app = await startApp({ workspace, autoPreview: false });
  await importVideo({ workspace, source, editor: app.editor });
  let p = (await app.editor("/api/context")).project;
  await app.editor("/api/clip", {
    revision: p.revision,
    id: p.clips[0].id,
    patch: { in: 0.5, duration: 6, volume: 4 },
  });
  fs.writeFileSync(
    path.join(workspace, "lib/quality.dart"),
    "import 'package:flutter/widgets.dart'; Widget buildGraphics(double t, Map<String,dynamic> m)=>const SizedBox.shrink();",
  );
  p = (await app.editor("/api/context")).project;
  await app.editor("/api/add-graphics", {
    revision: p.revision,
    source: "lib/quality.dart",
    name: "Red overlay",
    duration: 6,
    start: 0,
    track: 1,
  });
  const job = "fixture";
  const dir = path.join(workspace, ".editor/playground", job);
  fs.mkdirSync(dir);
  ff([
    "-f",
    "lavfi",
    "-i",
    "color=c=black@0:s=1440x2560:r=30:d=6,format=rgba,drawbox=x=0:y=0:w=720:h=1280:color=red@1:t=fill:replace=1,format=yuva420p",
    "-c:v",
    "libvpx-vp9",
    "-threads",
    "2",
    "-deadline",
    "realtime",
    "-cpu-used",
    "8",
    "-auto-alt-ref",
    "0",
    "-pix_fmt",
    "yuva420p",
    path.join(dir, "overlay_track_1.webm"),
  ]);
  fs.copyFileSync(
    path.join(dir, "overlay_track_1.webm"),
    path.join(dir, "overlay.webm"),
  );
  ff([
    "-ss",
    "0.5",
    "-i",
    source,
    "-t",
    "6",
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    path.join(dir, "preview.mp4"),
  ]);
  p = (await app.editor("/api/context")).project;
  app.playground.jobs.push({
    id: job,
    status: "complete",
    kind: "export",
    revision: p.revision,
    width: p.width,
    height: p.height,
    duration: 6,
    artifact: true,
    overlay: true,
    previewTracks: [1],
    fingerprint: app.playground.fingerprint(),
    fingerprintVersion: 4,
  });
  app.playground.persist();
  fs.writeFileSync(
    path.join(workspace, ".editor/onboarding.json"),
    '{"complete":true}',
  );
  await fetch(app.url + "/chat/onboarding", {
    method: "POST",
    headers: { Authorization: "Bearer " + app.token },
    body: JSON.stringify({
      complete: true,
      skipProvider: true,
      withoutVideo: true,
    }),
  });
  const projectBefore = fs.readFileSync(path.join(workspace, "project.json"));
  const exportBefore = hash(path.join(dir, "preview.mp4"));
  const sourceBefore = hash(source);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.EDITOR_CHROMIUM
      ? { executablePath: process.env.EDITOR_CHROMIUM }
      : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.__gainNodes = [];
    window.AudioContext = class extends Native {
      createGain() {
        const g = super.createGain();
        window.__gainNodes.push(g);
        return g;
      }
    };
  });
  await page.goto(
    app.url + "/#token=" + app.token + "&editorToken=" + app.editorToken,
  );
  const editor = page.frameLocator("#editor");
  const quality = editor.getByRole("combobox", { name: "Preview quality" });
  const widths = async (width) => {
    await page.waitForFunction(
      (w) => {
        const videos = [
          ...document
            .querySelector("#editor")
            .contentDocument.querySelectorAll(".stage video"),
        ];
        return (
          videos.length === 2 &&
          videos.every(
            (v) => v.videoWidth === w && v.readyState >= 2 && !v.seeking,
          )
        );
      },
      width,
      { timeout: 60000 },
    );
  };
  await quality.selectOption("720");
  await widths(720);
  const colors = await editor.locator(".stage").evaluate((stage) => {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 284;
    const ctx = c.getContext("2d");
    for (const v of stage.querySelectorAll("video"))
      ctx.drawImage(v, 0, 0, 160, 284);
    return {
      red: [...ctx.getImageData(20, 20, 1, 1).data],
      blue: [...ctx.getImageData(140, 250, 1, 1).data],
    };
  });
  assert(colors.red[0] > 180 && colors.red[2] < 60, JSON.stringify(colors));
  assert(
    colors.blue[2] > 180 && colors.blue[0] < 60,
    "Proxy lost transparency: " + JSON.stringify(colors),
  );
  await quality.selectOption("original");
  await widths(1440);
  const ruler = editor.getByRole("slider", { name: "Timeline playhead" });
  await ruler.press("Home");
  for (let i = 0; i < 30; i++) await ruler.press("ArrowRight");
  await quality.selectOption("1080");
  await widths(1080);
  const times = await editor
    .locator(".stage video")
    .evaluateAll((videos) => videos.map((v) => v.currentTime));
  assert(Math.abs(times[0] - 1.5) < 0.05, JSON.stringify(times));
  assert(Math.abs(times[1] - 1) < 0.05, JSON.stringify(times));
  // Already-cached quality switches must resume real audio at the same source time.
  await ruler.press("Home");
  await editor.getByRole("button", { name: "Play", exact: true }).click();
  await quality.selectOption("720");
  await widths(720);
  await page.waitForFunction(
    () =>
      document.querySelector("#editor").contentWindow.__gainNodes?.[0]?.context
        .state === "running",
  );
  const rms = await editor.locator(".stage").evaluate(async () => {
    const g = window.__gainNodes[0];
    const a = g.context.createAnalyser();
    g.connect(a);
    const samples = new Float32Array(a.fftSize);
    let rms = 0;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 40));
      a.getFloatTimeDomainData(samples);
      rms = Math.max(
        rms,
        Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length),
      );
    }
    g.disconnect(a);
    return rms;
  });
  assert(rms > 0.01, "Audio did not resume after quality switch");
  if (await editor.getByRole("button", { name: "Pause", exact: true }).count())
    await editor.getByRole("button", { name: "Pause", exact: true }).click();
  await quality.selectOption("auto");
  await widths(720);
  // Decoder failures in a disposable copy recover to the untouched source.
  await editor
    .locator(".stage video")
    .first()
    .evaluate((v) => v.dispatchEvent(new Event("error")));
  await page.waitForFunction(() => {
    const v = document
      .querySelector("#editor")
      .contentDocument.querySelector(".stage video");
    return (
      v.dataset.previewState === "failed" &&
      v.videoWidth === 1440 &&
      v.readyState >= 2
    );
  });
  assert.equal(await editor.getByRole("alert").count(), 0);
  await quality.selectOption("original");
  await widths(1440);
  await quality.selectOption("720");
  await widths(720);
  await page.route("**/api/playback-preview*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "failed" }),
    }),
  );
  await quality.selectOption("1080");
  await page.waitForFunction(() => {
    const v = document
      .querySelector("#editor")
      .contentDocument.querySelector(".stage video");
    return (
      v.dataset.previewState === "failed" &&
      v.videoWidth === 1440 &&
      v.readyState >= 2
    );
  });
  assert(
    await editor
      .getByRole("status", {
        name: "Preview unavailable; using original",
        exact: true,
      })
      .isVisible(),
  );
  await page.unroute("**/api/playback-preview*");
  await quality.selectOption("720");
  await widths(720);
  assert.equal(
    await editor
      .getByRole("status", {
        name: "Preview unavailable; using original",
        exact: true,
      })
      .count(),
    0,
  );
  assert.deepEqual(
    fs.readFileSync(path.join(workspace, "project.json")),
    projectBefore,
  );
  assert.equal(hash(source), sourceBefore);
  assert.equal(hash(path.join(dir, "preview.mp4")), exportBefore);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(root, "quality-controls.png") });
  console.log(
    "PASS: 720p/1080p/Original/Auto, transparent compositing, trimmed-source seeking, audio resume, unchanged project/source/export. " +
      root,
  );
} finally {
  await browser?.close();
  await app?.close();
  fs.rmSync(root, { recursive: true, force: true });
}
