import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startApp } from "../src/server.mjs";
import { createWorkspace } from "../src/workspace-library.mjs";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.EDITOR_PLAYWRIGHT || "playwright");
const root = fs.mkdtempSync(
  path.join(os.homedir(), ".cache/cmrx-image-paste-"),
);
let app, browser, received;
try {
  createWorkspace(path.join(root, "Studio"));
  const workspace = path.join(root, "Studio/projects/Video");
  fs.mkdirSync(path.join(workspace, ".editor"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".editor/onboarding.json"),
    '{"complete":true}',
  );
  app = await startApp({
    workspace,
    workspaceRoot: path.join(root, "Studio"),
    providerFactory: ({ onEvent, onTool }) => ({
      async start() {},
      async account() {
        return { connected: true };
      },
      async models() {
        return [{ id: "test", name: "Test", isDefault: true }];
      },
      async prompt(text, context) {
        const images = await Promise.all(
          context.attachedAssets.map((asset) =>
            onTool("workspace_image", { path: asset.workspacePath }),
          ),
        );
        received = { text, context, images };
        onEvent({ type: "delta", text: "Images received.", itemId: "reply" });
        onEvent({ type: "complete" });
      },
      close() {},
    }),
  });
  await app.ready;
  browser = await chromium.launch({
    executablePath: process.env.EDITOR_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  let imports = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/chat/asset-import") imports++;
  });
  await page.goto(
    app.url + "/#token=" + app.token + "&editorToken=" + app.editorToken,
  );
  await fetch(app.url + "/chat/login", {
    method: "POST",
    headers: { Authorization: "Bearer " + app.token },
    body: JSON.stringify({ provider: "chatgpt" }),
  });
  await page.waitForFunction(() => !document.querySelector("#send").disabled);
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 12;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#542684";
    ctx.fillRect(0, 0, 16, 12);
    return c.toDataURL("image/png").split(",")[1];
  });
  const bytes = Buffer.from(png, "base64");
  const paste = (names) =>
    page.locator("#prompt").evaluate(
      (input, { png, names }) => {
        const data = new DataTransfer();
        data.setData("text/plain", "clipboard caption");
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
        for (const name of names)
          data.items.add(new File([bytes], name, { type: "image/png" }));
        const e = new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        });
        input.dispatchEvent(e);
        return e.defaultPrevented;
      },
      { png, names },
    );
  await page.locator("#prompt").fill("Keep this draft");
  assert.equal(
    await page.locator("#prompt").evaluate((input) => {
      const data = new DataTransfer();
      data.setData("text/plain", "ordinary text");
      const e = new ClipboardEvent("paste", {
        clipboardData: data,
        cancelable: true,
        bubbles: true,
      });
      input.dispatchEvent(e);
      return e.defaultPrevented;
    }),
    false,
  );
  assert.equal(imports, 0);
  let continueUpload;
  await page.route("**/chat/asset-import", async (route) => {
    await new Promise((resolve) => {
      continueUpload = resolve;
    });
    await route.continue();
  });
  assert.equal(await paste(["reference.png"]), true);
  for (let i = 0; i < 100 && !continueUpload; i++)
    await new Promise((r) => setTimeout(r, 10));
  assert(continueUpload);
  assert(await page.locator("#send").isDisabled());
  await page.locator("#prompt").press("Enter");
  assert.equal(received, undefined);
  const whilePending = imports;
  await paste(["while-uploading.png"]);
  assert.equal(imports, whilePending);
  continueUpload();
  await page.waitForFunction(
    () => document.querySelector("#asset-attachments img")?.naturalWidth === 16,
  );
  await page.unroute("**/chat/asset-import");
  assert.equal(await page.locator("#prompt").inputValue(), "Keep this draft");
  assert.equal(await page.locator("#asset-attachments .asset-chip").count(), 1);
  assert(await page.locator("#asset-attachments").isVisible());
  assert.equal(await page.locator("#asset-import-status").textContent(), "");
  const thumbnail = await page.locator("#asset-attachments img").boundingBox();
  assert.equal(thumbnail.width, 56);
  assert.equal(thumbnail.height, 56);
  const first = fs.readdirSync(path.join(workspace, "assets/imports"))[0];
  assert.deepEqual(
    fs.readFileSync(path.join(workspace, "assets/imports", first)),
    bytes,
  );
  await page
    .getByRole("button", { name: "Remove asset reference.png", exact: true })
    .click();
  assert.equal(await page.locator("#asset-attachments .asset-chip").count(), 0);
  assert(fs.existsSync(path.join(workspace, "assets/imports", first)));
  // Invalid batch must not upload anything, nor consume the text draft.
  const beforeLimit = imports;
  await paste(Array.from({ length: 21 }, (_, i) => "extra-" + i + ".png"));
  await page.waitForFunction(() =>
    document.querySelector("#error").textContent.includes("20 assets"),
  );
  assert.equal(imports, beforeLimit);
  assert.equal(await page.locator("#prompt").inputValue(), "Keep this draft");
  // Network failures retain the draft and do not attach phantom files.
  await page.route("**/chat/asset-import", (route) =>
    route.fulfill({
      status: 413,
      contentType: "application/json",
      body: JSON.stringify({ error: "Upload rejected fixture" }),
    }),
  );
  await paste(["failed.png"]);
  await page.waitForFunction(() =>
    document
      .querySelector("#error")
      .textContent.includes("Upload rejected fixture"),
  );
  assert.equal(await page.locator("#asset-attachments .asset-chip").count(), 0);
  assert.equal(await page.locator("#prompt").inputValue(), "Keep this draft");
  await page.unroute("**/chat/asset-import");
  await page.locator("#prompt").fill("");
  await paste(["one.png", "two.png"]);
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#asset-attachments .asset-chip").length ===
        2 && !document.querySelector("#send").disabled,
  );
  await page.screenshot({ path: path.join(root, "image-previews.png") });
  await page.route("**/chat/send", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Send rejected fixture" }),
    }),
  );
  await page.locator("#send").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#error")
      .textContent.includes("Send rejected fixture"),
  );
  assert.equal(await page.locator("#asset-attachments .asset-chip").count(), 2);
  await page.unroute("**/chat/send");
  let continueSend;
  await page.route("**/chat/send", async (route) => {
    await new Promise((resolve) => {
      continueSend = resolve;
    });
    await route.continue();
  });
  await page.locator("#send").click();
  for (let i = 0; i < 100 && !continueSend; i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert(continueSend);
  await paste(["next-draft.png"]);
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#asset-attachments .asset-chip").length === 3,
  );
  continueSend();
  for (let i = 0; i < 100 && !received; i++)
    await new Promise((r) => setTimeout(r, 20));
  assert(received);
  assert.equal(received.context.attachedAssets.length, 2);
  assert.equal(received.images.length, 2);
  for (const result of received.images) {
    const image = result.content.find((c) => c.type === "image");
    assert(image);
    assert.equal(image.mimeType, "image/png");
    assert.equal(
      Buffer.from(image.data, "base64").subarray(1, 4).toString(),
      "PNG",
    );
  }
  for (const image of received.context.attachedAssets) {
    assert.match(image.workspacePath, /^assets\/imports\//);
    assert.equal(image.type, "image");
    assert.deepEqual(
      fs.readFileSync(path.join(workspace, image.workspacePath)),
      bytes,
    );
  }
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#asset-attachments .asset-chip").length === 1,
  );
  assert(
    await page
      .getByRole("button", { name: "Remove asset next-draft.png", exact: true })
      .isVisible(),
  );
  await page
    .getByRole("button", { name: "Remove asset next-draft.png", exact: true })
    .click();
  await page.unroute("**/chat/send");
  assert(await page.locator("#asset-attachments").isHidden());
  assert.equal(await page.locator("#asset-import-status").textContent(), "");
  assert.equal(await page.locator("#prompt").inputValue(), "");
  assert.equal(await page.locator(".message.user .asset-chip").count(), 2);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(workspace, "project.json"))).clips
      .length,
    0,
  );
  // The shared importer still handles files dropped into the editor without attaching them to chat.
  const beforeDrop = imports;
  await page.locator("#editor").evaluate((frame, png) => {
    const data = new DataTransfer();
    data.items.add(
      new File(
        [Uint8Array.from(atob(png), (c) => c.charCodeAt(0))],
        "dropped.png",
        { type: "image/png" },
      ),
    );
    frame.contentDocument.dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, png);
  await page.waitForFunction(() =>
    document
      .querySelector("#asset-import-status")
      .textContent.includes("dropped.png"),
  );
  assert.equal(imports, beforeDrop + 1);
  assert.equal(await page.locator("#asset-attachments .asset-chip").count(), 0);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(root, "image-paste.png") });
  console.log(
    "PASS: clipboard image/text handling, byte-preserving project upload, thumbnail/remove, limit/failure recovery, image-only agent payload and editor drop regression. Evidence " +
      root,
  );
} finally {
  await browser?.close();
  await app?.close();
}
