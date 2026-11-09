import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startApp } from "../src/server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.EDITOR_PLAYWRIGHT || "playwright");
const root = fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-runtime-ui-"));
let app, browser;
try {
  fs.mkdirSync(path.join(root, ".editor"));
  fs.writeFileSync(
    path.join(root, ".editor/onboarding.json"),
    '{"complete":true}',
  );
  app = await startApp({
    workspace: root,
    providerFactory: () => ({ async start() {}, close() {} }),
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
  await page.locator('#preview-status[data-preview-phase="ready"]').waitFor();
  const job = {
    id: "state-fixture",
    kind: "overlay",
    status: "running",
    phase: "capturing",
    track: 0,
    trackCount: 2,
  };
  app.playground.jobs.push(job);
  app.playground.persist();
  await page.waitForFunction(() =>
    document
      .querySelector("#preview-status")
      .textContent.includes("Rendering graphics preview · layer 1/2"),
  );
  assert.equal(
    await page.locator("#preview-status").getAttribute("data-owner"),
    "none",
  );
  assert(await page.locator("#render").isDisabled());
  const editor = page.frameLocator("#editor");
  await page.waitForFunction(
    () =>
      !document
        .querySelector("#editor")
        .contentDocument.querySelector(".timeline-add-video")?.disabled,
  );
  assert(
    !(await editor
      .getByRole("button", { name: "Add video", exact: true })
      .isDisabled()),
  );
  job.phase = "verifying";
  app.playground.persist();
  await page
    .locator('#preview-status[data-preview-phase="verifying"]')
    .waitFor();
  assert.match(
    await page.locator("#preview-status").textContent(),
    /Checking graphics preview/,
  );
  job.status = "failed";
  job.phase = "failed";
  app.playground.persist();
  await page.locator('#preview-status[data-preview-phase="failed"]').waitFor();
  assert.equal(
    await page.locator("#preview-status").textContent(),
    "Graphics preview failed",
  );
  assert(!(await page.locator("#render").isDisabled()));
  job.status = "interrupted";
  app.playground.persist();
  await page
    .locator('#preview-status[data-preview-phase="interrupted"]')
    .waitFor();
  assert.equal(
    await page.locator("#preview-status").textContent(),
    "Graphics preview interrupted",
  );
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(root, "runtime.png") });
  console.log(
    "PASS: idle agent/background preview, capture/layer/check/failure/recovery states, editable timeline and export gating. " +
      root,
  );
} finally {
  await browser?.close();
  await app?.close();
}
