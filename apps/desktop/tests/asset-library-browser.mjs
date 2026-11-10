import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { startApp } from "../src/server.mjs";
const cache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
const results =
  process.env.EDITOR_RESULTS || path.join(cache, "cmrx-asset-manager-ui");
fs.mkdirSync(results, { recursive: true });
const root = fs.mkdtempSync(path.join(cache, "cmrx-assets-browser-")),
  workspace = path.join(root, "project");
fs.mkdirSync(path.join(workspace, ".editor"), { recursive: true });
fs.writeFileSync(
  path.join(workspace, ".editor/onboarding.json"),
  '{"complete":true}',
);
const module = await import(
  pathToFileURL(
    process.env.EDITOR_PLAYWRIGHT ||
      path.join(
        os.homedir(),
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js",
      ),
  ).href
);
const { chromium } = module.default || module;
let app, browser, received, opened;
const errors = [];
try {
  const alternate = path.join(root, "Alternate library");
  fs.mkdirSync(alternate);
  app = await startApp({
    workspace,
    agentRoot: path.join(root, "agent"),
    home: path.join(root, "codex"),
    claudeHome: path.join(root, "claude"),
    pickAssetLibrary: async () => alternate,
    openAssetFolder: async (p) => {
      opened = p;
    },
    providerFactory: ({ onEvent }) => ({
      async start() {},
      async account() {
        return { connected: true };
      },
      async models() {
        return [{ id: "test", name: "Test", isDefault: true }];
      },
      async prompt(text, context) {
        received = { text, context };
        onEvent({
          type: "delta",
          text: "Selected asset received.",
          itemId: "asset-reply",
        });
        onEvent({ type: "complete" });
      },
      close() {},
    }),
  });
  const library = app.assets.library;
  fs.mkdirSync(path.join(library, "effects", "halo"), { recursive: true });
  const source = process.env.CHAT_TEST_VIDEO || "";
  const ff = (args) => execFileSync("ffmpeg", ["-v", "error", ...args]);
  ff(
    fs.existsSync(source)
      ? [
          "-ss",
          "4",
          "-i",
          source,
          "-t",
          "1",
          "-vf",
          "scale=360:640",
          "-c:v",
          "libx264",
          "-threads",
          "1",
          "-pix_fmt",
          "yuv420p",
          path.join(library, "clip.mp4"),
        ]
      : [
          "-f",
          "lavfi",
          "-i",
          "color=c=purple:s=360x640:r=30:d=1",
          "-c:v",
          "libx264",
          "-threads",
          "1",
          "-pix_fmt",
          "yuv420p",
          path.join(library, "clip.mp4"),
        ],
  );
  ff([
    "-i",
    path.join(library, "clip.mp4"),
    "-frames:v",
    "1",
    path.join(library, "reference.png"),
  ]);
  ff([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    path.join(library, "sound.wav"),
  ]);
  const bundle = path.join(library, "effects", "halo");
  fs.copyFileSync(
    path.join(library, "clip.mp4"),
    path.join(bundle, "preview.mp4"),
  );
  fs.writeFileSync(
    path.join(bundle, "assetconfig.yaml"),
    "name: Halo ring\ntype: shader\ndescription: Soft halo above the presenter\ntags: [glow, title]\npreview: {file: preview.mp4, type: video}\ninstructions: SKILL.md\nlicense: MIT\n",
  );
  fs.writeFileSync(
    path.join(bundle, "SKILL.md"),
    "---\nname: halo\ndescription: Paint a halo\n---\nUse src/ring.frag. Keep the presenter visible.",
  );
  fs.mkdirSync(path.join(bundle, "src"));
  fs.writeFileSync(
    path.join(bundle, "src/ring.frag"),
    "arbitrary source, never executed by browsing",
  );
  fs.mkdirSync(path.join(library, "unfinished"));
  fs.writeFileSync(
    path.join(library, "unfinished", "assetconfig.yaml"),
    "name: Unfinished\ntype: chart\n",
  );
  browser = await chromium.launch({
    executablePath: process.env.EDITOR_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    app.url + "/#token=" + app.token + "&editorToken=" + app.editorToken,
  );
  const call = async (route, body = {}) => {
    const r = await fetch(app.url + "/chat/" + route, {
      method: "POST",
      headers: { Authorization: "Bearer " + app.token },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  await call("login", { provider: "chatgpt" });
  await page.locator("#assets-open").click();
  const breadcrumb = page.locator("#assets-breadcrumb");
  await breadcrumb
    .locator('[aria-current="location"]')
    .getByText(library + "/", { exact: true })
    .waitFor();
  assert.equal(
    await breadcrumb
      .getByRole("button", { name: "Go to parent asset folder", exact: true })
      .count(),
    0,
  );
  const rootBreadcrumbHeight = (await breadcrumb.boundingBox()).height;
  await page
    .getByRole("button", { name: "Open folder effects", exact: true })
    .click();
  await breadcrumb
    .locator('[aria-current="location"]')
    .getByText("effects/", { exact: true })
    .waitFor();
  assert.equal((await breadcrumb.boundingBox()).height, rootBreadcrumbHeight);
  await breadcrumb
    .getByRole("button", { name: "Go to parent asset folder", exact: true })
    .click();
  await breadcrumb
    .locator('[aria-current="location"]')
    .getByText(library + "/", { exact: true })
    .waitFor();
  assert.equal(
    await breadcrumb
      .getByRole("button", { name: "Go to parent asset folder", exact: true })
      .count(),
    0,
  );

  await page
    .getByRole("button", { name: "Preview asset reference.png", exact: true })
    .click();
  await page.locator("#asset-detail img").waitFor();
  await page.waitForFunction(
    () => document.querySelector("#asset-detail img")?.naturalWidth > 0,
  );
  await page
    .getByRole("button", { name: "Preview asset sound.wav", exact: true })
    .click();
  await page.locator("#asset-detail audio").evaluate(async (e) => {
    await e.play();
    e.pause();
  });
  await page
    .getByRole("button", { name: "Preview asset Unfinished", exact: true })
    .click();
  await page.getByText("No preview yet", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Generate preview", exact: true })
    .waitFor();
  await page.getByRole("searchbox", { name: "Search assets" }).fill("glow");
  await page
    .getByRole("button", { name: "Preview asset Halo ring", exact: true })
    .click();
  await page.locator("#asset-detail video").evaluate(async (e) => {
    await e.play();
    e.pause();
  });
  assert.equal(
    await page.locator("#asset-detail video").evaluate((e) => e.videoWidth),
    360,
  );
  await page.screenshot({ path: path.join(results, "asset-manager.png") });
  await page
    .getByRole("button", { name: "Attach to chat", exact: true })
    .click();
  await page.locator("#assets-dialog").waitFor({ state: "hidden" });
  assert.match(
    await page.locator("#asset-attachments").innerText(),
    /Halo ring/,
  );
  assert(
    fs.existsSync(path.join(workspace, "assets/library/halo/src/ring.frag")),
  );
  await page.locator("#prompt").fill("Use this above me in the introduction.");
  await page.locator("#send").click();
  await page.getByText("Selected asset received.", { exact: true }).waitFor();
  assert.match(
    received.context.attachedAssets[0].instructions,
    /Keep the presenter/,
  );
  await page
    .locator("#asset-attachments .asset-chip")
    .waitFor({ state: "hidden" });
  assert.equal(await page.locator("#asset-attachments .asset-chip").count(), 0);
  assert.equal(await page.locator(".message.user .asset-chip").count(), 1);
  await page.locator("#assets-open").click();
  await page
    .getByRole("button", { name: "Preview asset Halo ring", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await page
    .locator(".confirm-dialog")
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await page.getByText("No matching assets.", { exact: true }).waitFor();
  assert(!fs.existsSync(bundle));
  assert(fs.existsSync(path.join(workspace, "assets/library/halo/SKILL.md")));
  await page.locator("#assets-search").fill("");
  await page.locator("#assets-project").click();
  await page
    .getByRole("button", { name: "Open folder library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preview asset Halo ring", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save to library", exact: true })
    .click();
  await page.waitForFunction(() => !document.querySelector("#asset-detail h3"));
  assert(fs.existsSync(path.join(library, "halo/assetconfig.yaml")));
  await page.locator("#assets-close").click();
  await page.locator("#settings-open").click();
  await page.locator('[data-tab="project"]').click();
  await page.locator("#asset-library-choose").click();
  await page.waitForFunction(
    (p) => document.querySelector("#asset-library-folder").value === p,
    alternate,
  );
  await page.locator("#asset-library-open").click();
  for (let i = 0; i < 30 && !opened; i++)
    await new Promise((r) => setTimeout(r, 20));
  assert.equal(opened, alternate);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real image/video/audio previews, nested bundle search, missing preview, chat copy/instructions, promotion, trash preserves project, configurable/openable library; no browser errors.",
  );
} finally {
  await browser?.close();
  await app?.close();
  fs.rmSync(root, { recursive: true, force: true });
}
