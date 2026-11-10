import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startApp } from "../src/server.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.EDITOR_PLAYWRIGHT || "playwright",
);
const root = fs.mkdtempSync(
  path.join(os.homedir(), ".cache/cmrx-design-flow-"),
);
let app, browser, emit;
try {
  app = await startApp({
    workspace: path.join(root, "First project"),
    autoPreview: false,
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
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    app.url + "/#token=" + app.token + "&editorToken=" + app.editorToken,
  );
  await page
    .getByRole("heading", { name: "Connect your account.", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelector(".setup-art canvas")?.width > 0,
  );
  const card = page.locator('[data-provider="chatgpt"]');
  const entry = app.manager.entries.get("chatgpt");
  entry.preparing = { phase: "checking", text: "Preparing secure sign-in…" };
  app.publish();
  const progress = card.getByRole("progressbar", {
    name: "Connection setup",
    exact: true,
  });
  await progress.waitFor();
  assert.equal(await progress.getAttribute("aria-valuenow"), null);
  entry.preparing = {
    phase: "downloading",
    percent: 37,
    text: "Preparing ChatGPT · 37%",
  };
  app.publish();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-provider="chatgpt"] [role="progressbar"]')
        ?.getAttribute("aria-valuenow") === "37",
  );
  assert.equal(await card.locator(".install-percent").textContent(), "37%");
  // Wait for the short width transition; the bar must represent reported bytes, not a timer.
  await page.waitForFunction(() => {
    const el = document.querySelector(
      '[data-provider="chatgpt"] .dither-progress',
    );
    return (
      Math.abs(
        el.firstElementChild.getBoundingClientRect().width /
          el.getBoundingClientRect().width -
          0.37,
      ) < 0.01
    );
  });
  assert.equal(
    await card
      .locator(".matrix-loader")
      .evaluate((el) => getComputedStyle(el.firstElementChild).animationName),
    "matrix-wave",
  );
  const matrix = card.locator(".matrix-loader");
  assert.equal(await matrix.locator("i").count(), 16);
  const dimensions = await matrix.evaluate((el) => {
    const cells = [...el.children];
    return {
      width: el.getBoundingClientRect().width,
      first: getComputedStyle(cells[0]).animationDelay,
      last: getComputedStyle(cells[15]).animationDelay,
    };
  });
  assert.equal(dimensions.width, 14);
  assert.notEqual(
    dimensions.first,
    dimensions.last,
    "cells form a staggered wave",
  );
  await page.screenshot({ path: path.join(root, "installation.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await card
      .locator(".matrix-loader")
      .evaluate((el) => getComputedStyle(el.firstElementChild).animationName),
    "none",
  );
  assert.equal(
    await page
      .locator(".setup-art canvas")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  entry.preparing = { phase: "verifying", text: "Checking download…" };
  app.publish();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-provider="chatgpt"] [role="progressbar"]')
        ?.getAttribute("data-determinate") === "false",
  );
  assert.equal(await progress.getAttribute("aria-valuenow"), null);
  entry.preparing = null;
  entry.error = "Download interrupted. Try again.";
  app.publish();
  await progress.waitFor({ state: "hidden" });
  assert(
    await card
      .getByRole("button", { name: "Connect ChatGPT", exact: true })
      .isEnabled(),
  );
  entry.error = null;
  app.publish();
  await card
    .getByRole("button", { name: "Connect ChatGPT", exact: true })
    .click();
  await page.locator("#account-next").waitFor();
  await page.locator("#account-next").click();
  await page
    .getByRole("heading", { name: "Start your video.", exact: true })
    .waitFor();
  assert.equal(await page.locator(".setup-choices button").count(), 2);
  await page.screenshot({ path: path.join(root, "start-video.png") });
  await page.locator("#start-blank").click();
  await page.locator("#start-screen").waitFor({ state: "hidden" });
  await page.locator("#prompt").fill("Develop this idea");
  await page.locator("#prompt").press("Enter");
  await page.frameLocator("#editor").locator(".player-working").waitFor();
  assert.equal(
    await page
      .frameLocator("#editor")
      .locator(".player-spinner")
      .evaluate((el) => getComputedStyle(el.firstElementChild).animationName),
    "none",
  );
  assert(await page.locator("#activity-matrix").isVisible());
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert.equal(
    await page
      .frameLocator("#editor")
      .locator(".player-spinner")
      .evaluate((el) => getComputedStyle(el.firstElementChild).animationName),
    "matrix-wave",
  );
  await emit({ type: "complete" });
  await page.locator("#activity-matrix").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1100, height: 800 });
  assert(await page.locator("#send").isVisible());
  assert.deepEqual(errors, []);
  console.log(
    "PASS: onboarding art, reported/unknown download progress, failure/retry, reduced motion, shared chat/player matrix loaders, and first chat. " +
      root,
  );
} finally {
  await browser?.close();
  await app?.close();
}
