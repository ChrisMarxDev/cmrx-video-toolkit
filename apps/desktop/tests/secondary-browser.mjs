import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { startApp } from "../src/server.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.EDITOR_PLAYWRIGHT || "playwright",
);
const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-secondary-ui-"),
  ),
  workspace = path.join(root, "Project");
fs.mkdirSync(path.join(workspace, ".editor"), { recursive: true });
fs.writeFileSync(
  path.join(workspace, ".editor/onboarding.json"),
  '{"complete":true}',
);
let app, browser;
try {
  app = await startApp({
    workspace,
    agentRoot: path.join(root, "agent"),
    home: path.join(root, "codex"),
    claudeHome: path.join(root, "claude"),
    autoPreview: false,
    openAssetFolder: async () => {},
  });
  await app.ready;
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=0xbfb7cf:s=480x270",
    "-frames:v",
    "1",
    path.join(app.assets.library, "Cover.png"),
  ]);
  browser = await chromium.launch({
    executablePath: process.env.EDITOR_CHROMIUM || "/usr/bin/chromium",
    headless: true,
  });
  const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    app.url + "/#token=" + app.token + "&editorToken=" + app.editorToken,
  );
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page
    .locator(".settings-tabs")
    .getByRole("button", { name: "Connections", exact: true })
    .click();

  assert(await page.locator("#secret-form").isHidden());
  assert(await page.locator("#connection-form").isHidden());
  const removals = { key: 0, connection: 0, asset: 0 };
  page.on("request", (request) => {
    const route = new URL(request.url()).pathname;
    if (route === "/chat/secret-remove") removals.key++;
    if (route === "/chat/connection-remove") removals.connection++;
    if (route === "/chat/assets-trash") removals.asset++;
  });
  const settled = () =>
    page
      .locator(".settings-feedback .matrix-loader")
      .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Add key", exact: true }).click();
  await page.getByLabel("Key name", { exact: true }).fill("Review key");
  await page
    .getByLabel("Secret key", { exact: true })
    .fill("synthetic-review-only-value");
  await page
    .locator("#secret-form")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  assert(await page.locator("#secret-form").isHidden());
  assert.equal(
    await page.getByLabel("Secret key", { exact: true }).inputValue(),
    "",
  );
  await page.getByRole("button", { name: "Add key", exact: true }).click();
  await page.getByLabel("Key name", { exact: true }).fill("Review key");
  await page
    .getByLabel("Secret key", { exact: true })
    .fill("synthetic-review-only-value");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  const key = page
    .locator("#secret-list .connection-card")
    .filter({ hasText: "Review key" });
  await key.waitFor();
  await settled();
  assert(await page.locator("#secret-form").isHidden());
  await key.getByRole("button", { name: "Replace", exact: true }).click();
  assert.equal(
    await page.getByLabel("Secret key", { exact: true }).inputValue(),
    "",
  );
  await page
    .locator("#secret-form")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  await page
    .locator('#connection-form [name="name"]')
    .fill("Review connection");
  await page.locator('#connection-form [name="type"]').selectOption("http");
  await page
    .getByLabel("Address", { exact: true })
    .fill("https://example.com/api");
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  const connection = page
    .locator("#connection-list .connection-card")
    .filter({ hasText: "Review connection" });
  await connection.waitFor();
  await settled();
  assert(await page.locator("#connection-form").isHidden());
  await connection.getByRole("button", { name: "Edit", exact: true }).click();
  assert.equal(
    await page.locator('#connection-form [name="name"]').inputValue(),
    "Review connection",
  );
  await page.locator("#connection-reset").click();
  await page.screenshot({ path: path.join(root, "settings-lists.png") });
  await connection.getByRole("button", { name: "Remove", exact: true }).click();
  const confirm = page.locator(".confirm-dialog");
  await confirm.waitFor();
  assert(
    await confirm
      .getByRole("button", { name: "Cancel", exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  assert((await confirm.innerText()).includes("Review connection"));
  await page.keyboard.press("Escape");
  await confirm.waitFor({ state: "hidden" });
  assert.equal(removals.connection, 0);
  assert(await connection.isVisible());
  await connection.getByRole("button", { name: "Remove", exact: true }).click();
  await confirm
    .getByRole("button", { name: "Remove connection", exact: true })
    .click();
  await connection.waitFor({ state: "hidden" });
  await settled();
  assert.equal(removals.connection, 1);
  await key.getByRole("button", { name: "Remove", exact: true }).click();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(removals.key, 0);
  await key.getByRole("button", { name: "Remove", exact: true }).click();
  await confirm
    .getByRole("button", { name: "Remove key", exact: true })
    .click();
  await key.waitFor({ state: "hidden" });
  await settled();
  assert.equal(removals.key, 1);
  const heading = await page
    .locator("#settings-dialog .settings-heading")
    .boundingBox();
  await page
    .locator('[data-settings-panel="connections"]')
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  assert.equal(
    (await page.locator("#settings-dialog .settings-heading").boundingBox()).y,
    heading.y,
  );
  assert(await page.locator(".settings-tabs").isVisible());
  await page.screenshot({ path: path.join(root, "settings-connections.png") });
  await page.locator(".settings-tabs").locator('[data-tab="project"]').click();
  assert(!(await page.locator("#workspace-instructions-label").isVisible()));
  await page.locator("#project-instructions").fill("Keep the opening concise.");
  let release,
    requests = 0;
  await page.route("**/chat/project-notes", async (route) => {
    requests++;
    if (requests === 1)
      await new Promise((resolve) => {
        release = resolve;
      });
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Save project notes", exact: true })
    .click();
  await page.locator(".settings-feedback .matrix-loader").waitFor();
  assert(
    await page
      .getByRole("button", { name: "Save project notes", exact: true })
      .isDisabled(),
  );
  await page
    .locator("#project-notes-form")
    .evaluate((el) => el.requestSubmit());
  assert.equal(requests, 1);
  release();
  await page
    .locator(".settings-feedback")
    .getByRole("status")
    .getByText("Done", { exact: true })
    .waitFor();
  assert.equal(
    fs.readFileSync(path.join(workspace, "AGENTS.md"), "utf8"),
    "Keep the opening concise.",
  );
  assert(
    await page
      .getByRole("button", { name: "Save project notes", exact: true })
      .isEnabled(),
  );
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  const cover = page.getByRole("button", {
    name: "Preview asset Cover.png",
    exact: true,
  });
  await cover.waitFor();
  await page.locator("#assets-loading").waitFor({ state: "hidden" });
  const originalProject = fs.readFileSync(
    path.join(workspace, "project.json"),
    "utf8",
  );
  await cover.dblclick();
  assert.equal(await page.locator("#asset-attachments .asset-chip").count(), 0);
  assert.equal(
    fs.readFileSync(path.join(workspace, "project.json"), "utf8"),
    originalProject,
  );
  assert.equal(await cover.getAttribute("aria-pressed"), "true");
  await page.waitForFunction(
    () => document.querySelector("#asset-detail img")?.naturalWidth === 480,
  );
  await page.screenshot({ path: path.join(root, "asset-selected.png") });
  let fail;
  await page.route("**/chat/assets-list", async (route) => {
    await new Promise((resolve) => {
      fail = resolve;
    });
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Library temporarily unavailable" }),
    });
  });
  await page
    .getByRole("button", { name: "Refresh assets", exact: true })
    .click();
  await page.locator("#assets-loading").waitFor();
  assert.equal(
    await page.locator(".asset-browser").getAttribute("aria-busy"),
    "true",
  );
  assert(await cover.isVisible());
  fail();
  await page
    .locator("#assets-status")
    .getByText("Library temporarily unavailable", { exact: true })
    .waitFor();
  await page.locator("#assets-loading").waitFor({ state: "hidden" });
  assert(
    await page
      .getByRole("button", { name: "Refresh assets", exact: true })
      .isEnabled(),
  );
  await page.unroute("**/chat/assets-list");
  await page
    .getByRole("button", { name: "Refresh assets", exact: true })
    .click();
  await page.locator("#assets-loading").waitFor({ state: "hidden" });
  assert.equal(await cover.getAttribute("aria-pressed"), "true");
  await page
    .getByRole("searchbox", { name: "Search assets", exact: true })
    .fill("no-such-asset");
  await page.getByText("No matching assets.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await cover.waitFor();
  await page.setViewportSize({ width: 700, height: 800 });
  await page.screenshot({ path: path.join(root, "assets-narrow.png") });
  assert(
    await page
      .getByRole("button", { name: "Close assets", exact: true })
      .isVisible(),
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .locator("#asset-detail")
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await page.locator(".confirm-dialog").waitFor();
  await page.screenshot({ path: path.join(root, "confirm-asset.png") });
  await page
    .locator(".confirm-dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  assert.equal(removals.asset, 0);
  assert(fs.existsSync(path.join(app.assets.library, "Cover.png")));
  await page
    .locator("#asset-detail")
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await page
    .locator(".confirm-dialog")
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await cover.waitFor({ state: "hidden" });
  assert.equal(removals.asset, 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: fixed settings navigation, guarded save/progress/success, asset selection, loading/failure/retry, empty-state recovery and narrow layout. " +
      root,
  );
} finally {
  await browser?.close();
  await app?.close();
}
