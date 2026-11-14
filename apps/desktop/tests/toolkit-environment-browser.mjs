import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { startApp } from "../src/server.mjs";
import { importVideo } from "../src/import-video.mjs";
const { chromium } = await import(pathToFileURL(process.env.EDITOR_PLAYWRIGHT));
const root = fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-toolkit-ui-")),
  results = process.env.EDITOR_RESULTS ?? root;
fs.mkdirSync(results, { recursive: true });
fs.mkdirSync(path.join(root, ".editor"));
fs.writeFileSync(
  path.join(root, ".editor/onboarding.json"),
  '{"complete":true}',
);
let app, browser;
const errors = [];
try {
  app = await startApp({ workspace: root, autoPreview: false });
  const file = path.join(root, "sample.mp4");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=640x360:r=30:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=3",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-c:a",
    "aac",
    "-pix_fmt",
    "yuv420p",
    file,
  ]);
  const imported = await importVideo({
    workspace: root,
    source: file,
    editor: app.editor,
    assetOnly: true,
  });
  let p = (await app.editor("/api/context")).project;
  assert.equal(p.clips.length, 0);
  await app.editor("/api/transcript", {
    revision: p.revision,
    assetId: imported.assetId,
    transcript: [{ start: 0.5, end: 1.5, text: "Source evidence" }],
  });
  p = (await app.editor("/api/context")).project;
  await app.editor("/api/operations", {
    revision: p.revision,
    operations: [
      {
        type: "component",
        definition: {
          id: "unknown-dynamic",
          schemaVersion: 1,
          source: "lib/unknown.dart",
          properties: {
            title: { type: "string" },
            amount: { type: "number", min: 0, max: 100 },
            enabled: { type: "boolean" },
            color: { type: "color" },
            shape: { type: "enum", options: ["ring", "box"] },
          },
          defaults: {
            title: "Original",
            amount: 20,
            enabled: true,
            color: "#ff0000",
            shape: "ring",
          },
        },
      },
    ],
  });
  p = (await app.editor("/api/context")).project;
  const graphic = {
    id: "g",
    kind: "graphics",
    componentId: "unknown-dynamic",
    name: "Unknown component",
    props: {},
    start: 0,
    in: 0,
    duration: 2,
    track: 1,
    x: 0,
    y: 0,
    width: 640,
    height: 360,
    muted: false,
  };
  await app.editor("/api/project", {
    revision: p.revision,
    project: { ...p, clips: [graphic] },
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.EDITOR_CHROMIUM ?? "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    app.url +
      "/#" +
      new URLSearchParams({ token: app.token, editorToken: app.editorToken }),
  );
  await page.locator("#start-screen").waitFor({ state: "hidden" });
  const f = page.frameLocator("#editor");
  await f
    .getByRole("button", { name: "Toggle transcript", exact: true })
    .click();
  await f.getByRole("button", { name: "Source frame 0.00 seconds" }).waitFor();
  await f.getByText("Source evidence", { exact: false }).waitFor();
  assert.equal(await f.locator(".source-levels").count(), 1);
  await f.getByLabel("Source range start", { exact: true }).fill("1");
  await f.getByLabel("Source insert length").fill("1");
  await f.getByRole("button", { name: "Insert range", exact: true }).click();
  await page.waitForFunction(async () => {
    const c = JSON.parse(sessionStorage.getItem("connection"));
    const p = (
      await (
        await fetch("/api/context", {
          headers: { Authorization: "Bearer " + c.editorToken },
        })
      ).json()
    ).project;
    return p.clips.some(
      (c) => c.kind === "video" && c.in === 1 && c.duration === 1,
    );
  });
  await f.locator('[data-clip="g"]').first().click();
  await f.getByLabel("title", { exact: true }).fill("Changed dynamically");
  await f.getByLabel("title", { exact: true }).press("Tab");
  await page.waitForFunction(async () => {
    const c = JSON.parse(sessionStorage.getItem("connection"));
    return (
      (
        await (
          await fetch("/api/context", {
            headers: { Authorization: "Bearer " + c.editorToken },
          })
        ).json()
      ).project.clips.find((c) => c.id === "g").props.title ===
      "Changed dynamically"
    );
  });
  await f.getByLabel("amount", { exact: true }).fill("42");
  await f.getByLabel("amount", { exact: true }).press("Tab");
  await page.waitForTimeout(200);
  p = (await app.editor("/api/context")).project;
  assert.equal(p.clips.find((c) => c.id === "g").props.amount, 42);
  await f.getByLabel("enabled", { exact: true }).uncheck();
  await page.waitForTimeout(200);
  p = (await app.editor("/api/context")).project;
  assert.equal(p.clips.find((c) => c.id === "g").props.enabled, false);
  await page.screenshot({
    path: path.join(results, "sources-and-dynamic-controls.png"),
  });

  // Use the actual editor menu so the source-window message check is exercised.
  await f
    .locator(".timeline-scroll")
    .click({ button: "right", position: { x: 20, y: 30 } });
  await f
    .getByRole("menuitem", { name: "Project history & interchange…" })
    .click();
  await page.getByRole("heading", { name: "Project history" }).waitFor();
  await page
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await page
    .getByLabel("Checkpoint name", { exact: true })
    .fill("UI checkpoint");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("UI checkpoint", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  fs.copyFileSync(file, path.join(root, "assets/any.mp4"));
  p = (await app.editor("/api/context")).project;
  const r = await fetch(app.url + "/chat/project-action", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + app.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "output-register",
      revision: p.revision,
      path: "assets/any.mp4",
    }),
  });
  assert.equal(r.status, 200, await r.clone().text());
  await f.getByLabel("Toolkit rendered output").waitFor();
  assert.equal(await f.locator(".stage video").count(), 1);
  await f.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(
    await f.getByLabel("Toolkit rendered output").evaluate((v) => v.paused),
    false,
  );
  await f.getByRole("button", { name: "Pause", exact: true }).click();
  assert.equal(
    await f.getByLabel("Toolkit rendered output").evaluate((v) => v.paused),
    true,
  );
  await page.screenshot({
    path: path.join(results, "single-rendered-review.png"),
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS source inspection/insertion, dynamic properties, checkpoint UI, single rendered player/playback, no browser errors.",
  );
} finally {
  await browser?.close();
  await app?.close();
  fs.rmSync(root, { recursive: true, force: true });
}
