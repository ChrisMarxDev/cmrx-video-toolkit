import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { startApp } from "../src/server.mjs";
import { importVideo } from "../src/import-video.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.EDITOR_PLAYWRIGHT || "playwright");
const root = fs.mkdtempSync(
  path.join(os.homedir(), ".cache/cmrx-audio-browser-"),
);
let app, browser;
try {
  const video = path.join(root, "tone.mp4");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=s=320x180:r=30:d=8",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=8",
    "-af",
    "volume=0.05",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    video,
  ]);
  app = await startApp({
    workspace: path.join(root, "project"),
    autoPreview: false,
  });
  await importVideo({
    workspace: app.workspace,
    source: video,
    editor: app.editor,
  });
  let project = (await app.editor("/api/context")).project;
  const id = project.clips[0].id;
  await app.editor("/api/clip", {
    revision: project.revision,
    id,
    patch: { volume: 4 },
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.EDITOR_CHROMIUM
      ? { executablePath: process.env.EDITOR_CHROMIUM }
      : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const failure = window.__playFailure;
      if (!failure) return originalPlay.call(this);
      if (failure === "Deferred")
        return new Promise((resolve, reject) =>
          (window.__pendingPlayRejects ||= []).push(reject),
        );
      return new Promise((resolve, reject) =>
        setTimeout(
          () => reject(new DOMException("Test playback rejection", failure)),
          25,
        ),
      );
    };
    const Native = window.AudioContext;
    window.__gainNodes = [];
    window.AudioContext = class extends Native {
      createGain() {
        const gain = super.createGain();
        window.__gainNodes.push(gain);
        return gain;
      }
    };
  });
  await page.goto(app.url + "/editor#token=" + app.editorToken);
  await page.waitForFunction(
    () => document.querySelector(".stage video")?.readyState >= 2,
  );
  // Deterministic cancellation, not dependent on decoder speed or OS scheduling.
  await page.evaluate(() => {
    window.__playFailure = "Deferred";
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.evaluate(() => {
    for (const reject of window.__pendingPlayRejects || [])
      reject(new DOMException("Outdated request", "NotAllowedError"));
  });
  await page.waitForTimeout(50);
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.evaluate(() => {
    window.__playFailure = "AbortError";
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.evaluate(() => {
    window.__playFailure = "NotAllowedError";
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /couldn’t start/);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Dismiss notice" }).click();
  await page.evaluate(() => {
    window.__playFailure = null;
  });
  const ruler = page.getByRole("slider", { name: "Timeline playhead" });
  await ruler.press("Home");
  for (let i = 0; i < 12; i++) {
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
  }
  await page.waitForTimeout(100);
  assert.equal(await page.getByRole("alert").count(), 0);
  await ruler.press("Home");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(
    () =>
      window.__gainNodes?.[0]?.context.state === "running" &&
      document.querySelector(".stage video").currentTime > 0.1,
  );
  const sample = () =>
    page.evaluate(async () => {
      const gain = window.__gainNodes[0];
      const analyser = gain.context.createAnalyser();
      analyser.fftSize = 2048;
      gain.connect(analyser);
      await new Promise((r) => setTimeout(r, 70));
      const data = new Float32Array(2048);
      analyser.getFloatTimeDomainData(data);
      gain.disconnect(analyser);
      return {
        gain: gain.gain.value,
        rms: Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length),
      };
    });
  const loud = await sample();
  assert.equal(loud.gain, 4);
  assert(loud.rms > 0.01, JSON.stringify(loud));
  // Verify actual audio output after every restart, not just a moving picture.
  for (let round = 0; round < 20; round++) {
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await ruler.press("Home");
    if (round % 4 === 0)
      await page.evaluate(() => window.__gainNodes[0].context.suspend());
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(
      () =>
        !document.querySelector(".stage video").paused &&
        !document.querySelector(".stage video").seeking &&
        window.__gainNodes[0].context.state === "running",
    );
    assert(
      (await sample()).rms > 0.01,
      `Audio did not recover after toggle round ${round}`,
    );
  }
  // A decoder/UI-clock drift must not trigger a seek on every animation frame.
  await page.evaluate(() => {
    const v = document.querySelector(".stage video");
    const clock = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "currentTime",
    );
    window.__resyncCount = 0;
    Object.defineProperty(v, "currentTime", {
      configurable: true,
      get() {
        return clock.get.call(this) - 0.3;
      },
      set(value) {
        window.__resyncCount++;
        clock.set.call(this, value);
      },
    });
  });
  await page.waitForTimeout(1100);
  assert(
    (await page.evaluate(() => window.__resyncCount)) <= 2,
    "Audio decoder was repeatedly flushed by catch-up seeks",
  );
  await page.evaluate(() => {
    delete document.querySelector(".stage video").currentTime;
  });
  await page.waitForFunction(
    () => !document.querySelector(".stage video").seeking,
  );
  assert(
    (await sample()).rms > 0.01,
    "Audio did not recover after drift correction",
  );
  const patch = async (patch) => {
    project = (await app.editor("/api/context")).project;
    await app.editor("/api/clip", { revision: project.revision, id, patch });
  };
  await patch({ volume: 1 });
  await page.waitForFunction(() => window.__gainNodes[0].gain.value === 1);
  const quiet = await sample();
  assert(Math.abs(loud.rms / quiet.rms - 4) < 0.25, `${loud.rms}/${quiet.rms}`);
  await patch({ muted: true });
  await page.waitForFunction(() => window.__gainNodes[0].gain.value === 0);
  assert.equal((await sample()).rms, 0);
  await patch({ muted: false, volume: 4 });
  await page.waitForFunction(() => window.__gainNodes[0].gain.value === 4);
  assert((await sample()).rms > 0.01);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: rapid Play/Pause, canceled/outdated play promises and real failure reporting; audio gain/mute remain live.",
  );
} finally {
  await browser?.close();
  await app?.close();
  fs.rmSync(root, { recursive: true, force: true });
}
