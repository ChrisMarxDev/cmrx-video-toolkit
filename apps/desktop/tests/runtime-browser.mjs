import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startApp } from "../src/server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.EDITOR_PLAYWRIGHT || "playwright");
const root = fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-runtime-ui-"));
let app, browser, emit;
try {
  fs.mkdirSync(path.join(root, ".editor"));
  fs.writeFileSync(
    path.join(root, ".editor/onboarding.json"),
    '{"complete":true}',
  );
  app = await startApp({
    workspace: root,
    providerFactory: ({ onEvent }) => {
      emit = onEvent;
      return {
        async start() {},
        async account() {
          return { connected: true };
        },
        async models() {
          return [{ id: "test", name: "Test", isDefault: true }];
        },
        async prompt() {},
        close() {},
      };
    },
  });
  await app.ready;
  browser = await chromium.launch({
    executablePath: process.env.EDITOR_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    app.url + "/#token=" + app.token + "&editorToken=" + app.editorToken,
  );
  await page
    .locator('#preview-status[data-preview-phase="ready"]')
    .waitFor({ state: "attached" });
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
      .getByRole("button", { name: "Add to timeline", exact: true })
      .isDisabled()),
  );
  job.phase = "verifying";
  app.playground.persist();
  await page
    .locator('#preview-status[data-preview-phase="verifying"]')
    .waitFor({ state: "attached" });
  assert.match(
    await page.locator("#preview-status").textContent(),
    /Checking graphics preview/,
  );
  job.status = "failed";
  job.phase = "failed";
  app.playground.persist();
  await page
    .locator('#preview-status[data-preview-phase="failed"]')
    .waitFor({ state: "attached" });
  assert.equal(
    await page.locator("#preview-status").textContent(),
    "Graphics preview failed",
  );
  assert(!(await page.locator("#render").isDisabled()));
  job.status = "interrupted";
  app.playground.persist();
  await page
    .locator('#preview-status[data-preview-phase="interrupted"]')
    .waitFor({ state: "attached" });
  assert.equal(
    await page.locator("#preview-status").textContent(),
    "Graphics preview interrupted",
  );
  assert(await page.locator("#render-bar").isHidden());
  const readFoundation = () => {
    const style = getComputedStyle(document.documentElement);
    return ["--app-color-obsidian", "--app-color-lavender", "--app-focus"].map(
      (name) => style.getPropertyValue(name).trim(),
    );
  };
  const parentTokens = await page.evaluate(readFoundation);
  const editorTokens = await page
    .frames()
    .find((frame) => frame.parentFrame())
    .evaluate(readFoundation);
  assert.deepEqual(parentTokens, editorTokens);
  assert.equal(parentTokens[0], "#100b18");
  assert.equal(parentTokens[1], "#dfd6f4");
  assert.equal(parentTokens[2], "#c8c6d0");
  const dot = editor.locator(".workspace-status");
  await dot.hover();
  await editor.locator(".workspace-status-tip").waitFor();
  await editor
    .getByRole("button", { name: "Toggle comments", exact: true })
    .click();
  assert(
    (await editor
      .getByRole("button", { name: "Toggle comments", exact: true })
      .getAttribute("aria-expanded")) === "true",
  );
  await fetch(app.url + "/chat/login", {
    method: "POST",
    headers: { Authorization: "Bearer " + app.token },
    body: JSON.stringify({ provider: "chatgpt" }),
  });
  await fetch(app.url + "/chat/send", {
    method: "POST",
    headers: { Authorization: "Bearer " + app.token },
    body: JSON.stringify({ text: "Make an edit" }),
  });
  await editor.locator(".player-working").waitFor();
  await page
    .getByRole("button", { name: "Queue message", exact: true })
    .waitFor();
  assert(await page.locator("#send .queue-arrow").isVisible());
  assert(!(await page.locator("#send .send-arrow").isVisible()));
  assert(
    await page.getByRole("button", { name: "Stop", exact: true }).isVisible(),
  );
  await page.screenshot({ path: path.join(root, "working.png") });
  await editor
    .getByRole("button", { name: "More timeline actions", exact: true })
    .click();
  assert(
    await editor
      .getByRole("menuitem", { name: "Export video", exact: true })
      .isDisabled(),
  );
  await page.keyboard.press("Escape");
  await emit({ type: "complete" });
  await editor.locator(".player-working").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Send message", exact: true })
    .waitFor();
  assert(await page.locator("#send .send-arrow").isVisible());
  assert(!(await page.locator("#send .queue-arrow").isVisible()));
  assert(!(await page.locator("#stop").isVisible()));
  assert(
    await page
      .getByRole("button", { name: "Add a timed note", exact: true })
      .isVisible(),
  );
  assert(!(await editor.locator(".nav-hint").first().isVisible()));
  let exports = 0;
  await page.route("**/chat/render", (route) => {
    exports++;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "export-click-fixture" }),
    });
  });
  const exported = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/chat/render",
  );
  await editor
    .getByRole("button", { name: "More timeline actions", exact: true })
    .click();
  await editor
    .getByRole("menuitem", { name: "Export video", exact: true })
    .click();
  await exported;
  assert.equal(exports, 1);
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
