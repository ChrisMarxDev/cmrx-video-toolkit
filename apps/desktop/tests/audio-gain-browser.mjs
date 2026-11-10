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
    "PASS: real browser audio is amplified 4×; gain changes, mute and unmute remain live.",
  );
} finally {
  await browser?.close();
  await app?.close();
  fs.rmSync(root, { recursive: true, force: true });
}
