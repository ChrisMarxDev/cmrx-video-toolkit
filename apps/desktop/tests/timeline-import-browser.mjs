import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { startApp } from "../src/server.mjs";
import { createWorkspace } from "../src/workspace-library.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.EDITOR_PLAYWRIGHT || "playwright");
const root = fs.mkdtempSync(
  path.join(os.homedir(), ".cache/cmrx-timeline-import-"),
);
let app,
  browser,
  finishPicker,
  picks = 0;
try {
  const workspaceRoot = path.join(root, "Studio");
  createWorkspace(workspaceRoot);
  const workspace = path.join(workspaceRoot, "projects/Video");
  fs.mkdirSync(path.join(workspace, ".editor"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".editor/onboarding.json"),
    '{"complete":true}',
  );
  const video = path.join(root, "sample.mp4");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=purple:s=640x360:r=24:d=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    video,
  ]);
  app = await startApp({
    workspace,
    workspaceRoot,
    pickVideo: () => {
      picks++;
      return new Promise((resolve) => {
        finishPicker = resolve;
      });
    },
  });
  await app.ready;
  browser = await chromium.launch({
    executablePath: process.env.EDITOR_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    app.url + "/#token=" + app.token + "&editorToken=" + app.editorToken,
  );
  const button = page
    .frameLocator("#editor")
    .locator(".timeline-tools")
    .getByRole("button", { name: "Add to timeline", exact: true });
  await button.waitFor();
  assert.equal(await page.locator("#import").count(), 0);
  const project = () =>
    JSON.parse(fs.readFileSync(path.join(workspace, "project.json")));
  const before = project();
  await button.click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("#editor")
        .contentDocument.querySelector(".timeline-add-video").disabled,
  );
  assert.equal(picks, 1);
  // A duplicate iframe request must not launch another picker.
  await page
    .frames()
    .find((frame) => frame.parentFrame())
    .evaluate(() =>
      parent.postMessage({ type: "cmrx:add-video" }, location.origin),
    );
  finishPicker(null);
  await button.waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      !document
        .querySelector("#editor")
        .contentDocument.querySelector(".timeline-add-video").disabled,
  );
  assert.deepEqual(project(), before);
  assert.equal(picks, 1);
  await button.click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("#editor")
        .contentDocument.querySelector(".timeline-add-video").disabled,
  );
  finishPicker(video);
  await page.waitForFunction(
    () =>
      !document
        .querySelector("#editor")
        .contentDocument.querySelector(".timeline-add-video").disabled,
    null,
    { timeout: 30000 },
  );
  const after = project();
  assert.equal(after.clips.length, before.clips.length + 1);
  assert.deepEqual(
    after.assets.at(-1).provenance.originalDimensions,
    [640, 360],
  );
  assert.deepEqual(
    fs.readFileSync(path.join(workspace, after.assets.at(-1).path)),
    fs.readFileSync(video),
  );
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(root, "timeline-import.png") });
  console.log(
    "PASS: timeline placement, picker cancel, duplicate prevention and real full-resolution video import. " +
      root,
  );
} finally {
  finishPicker?.(null);
  await browser?.close();
  await app?.close();
}
