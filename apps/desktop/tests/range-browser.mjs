import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startApp } from "../src/server.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.EDITOR_PLAYWRIGHT || "playwright",
);
const root = fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-range-ui-"));
const workspace = path.join(root, "workspace");
execFileSync(process.execPath, [
  fileURLToPath(
    new URL("../../local-editor/scripts/demo.mjs", import.meta.url),
  ),
  "--workspace",
  workspace,
]);
fs.mkdirSync(path.join(workspace, ".editor"), { recursive: true });
fs.writeFileSync(
  path.join(workspace, ".editor/onboarding.json"),
  '{"complete":true}',
);
const project = () =>
  JSON.parse(fs.readFileSync(path.join(workspace, "project.json")));
let app, browser, emit;
try {
  app = await startApp({
    workspace,
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
      viewport: { width: 1600, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    app.url + "/#token=" + app.token + "&editorToken=" + app.editorToken,
  );
  const editor = page.frameLocator("#editor");
  const ruler = editor.getByRole("slider", {
    name: "Timeline playhead",
    exact: true,
  });
  await ruler.waitFor();
  const before = project();
  assert.equal(
    await editor.getByRole("button", { name: "Remove", exact: true }).count(),
    0,
  );
  assert(
    !(await editor
      .getByRole("button", { name: "Undo", exact: true })
      .isVisible()),
  );
  const redo = editor.getByRole("button", { name: "Redo", exact: true });
  assert(await redo.isVisible());
  assert(await redo.isDisabled());
  const box = await ruler.boundingBox();
  const zoom = await editor
    .getByRole("slider", { name: "Timeline zoom", exact: true })
    .inputValue();
  const x = (t) => box.x + t * Number(zoom),
    y = box.y + 8;
  await page.keyboard.down("Shift");
  await page.mouse.move(x(1), y);
  await page.mouse.down();
  await page.mouse.move(x(2), y, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  assert(
    await editor
      .getByLabel("Selected timeline range", { exact: true })
      .isVisible(),
  );
  await page.screenshot({ path: path.join(root, "range.png") });
  await page.keyboard.press("Shift+Backspace");
  await page.waitForFunction(
    ({ w, r }) =>
      fetch(w)
        .then((x) => x.json())
        .then((s) => s.project.revision > r),
    { w: app.url + "/api/state?token=" + app.editorToken, r: before.revision },
  );
  const cut = project();
  assert.equal(cut.revision, before.revision + 1);
  assert.equal(
    Math.max(...cut.clips.map((c) => c.start + c.duration)),
    Math.max(...before.clips.map((c) => c.start + c.duration)) - 1,
  );
  assert.deepEqual(cut.assets, before.assets);
  assert(
    cut.clips.some(
      (c) =>
        c.assetId === before.clips[0].assetId && c.in === 2 && c.start === 1,
    ),
  );
  await page.keyboard.press("Control+z");
  await page.waitForFunction(
    ({ url, r }) =>
      fetch(url)
        .then((x) => x.json())
        .then((s) => s.project.revision > r),
    { url: app.url + "/api/state?token=" + app.editorToken, r: cut.revision },
  );
  assert.deepEqual(project().clips, before.clips);
  await page.waitForFunction(
    () =>
      !document
        .querySelector("#editor")
        .contentDocument.querySelector('[aria-label="Redo"]').disabled,
  );
  await redo.click();
  await page.waitForFunction(
    ({ url, r }) =>
      fetch(url)
        .then((x) => x.json())
        .then((s) => s.project.revision >= r + 2),
    { url: app.url + "/api/state?token=" + app.editorToken, r: cut.revision },
  );
  assert.deepEqual(project().clips, cut.clips);
  await page.keyboard.press("Control+z");
  await page.waitForFunction(
    ({ url, r }) =>
      fetch(url)
        .then((x) => x.json())
        .then((s) => s.project.revision >= r + 3),
    { url: app.url + "/api/state?token=" + app.editorToken, r: cut.revision },
  );
  assert.deepEqual(project().clips, before.clips);

  // I/O and context menu share the selection and the same revision-checked edit.
  await page.mouse.click(x(1), y);
  await page.keyboard.press("i");
  await page.mouse.click(x(2), y);
  await page.keyboard.press("o");
  await page.mouse.click(x(1.5), y + 45, { button: "right" });
  const menu = editor.getByRole("menu", { name: "Timeline actions" });
  await menu.waitFor();
  assert(
    !(await menu.getByRole("menuitem", { name: /Remove range/ }).isDisabled()),
  );
  await page.screenshot({ path: path.join(root, "context-menu.png") });
  await page.keyboard.press("Escape");
  await editor
    .getByRole("button", { name: "More timeline actions", exact: true })
    .click();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  assert(
    await editor
      .getByRole("menuitem", { name: /Mark range start/ })
      .evaluate((e) => e === document.activeElement),
  );
  await page.keyboard.press("Escape");
  // Locking still blocks edits but leaves comment inspection/navigation intact.
  await fetch(app.url + "/chat/login", {
    method: "POST",
    headers: { Authorization: "Bearer " + app.token },
    body: JSON.stringify({ provider: "chatgpt" }),
  });
  await fetch(app.url + "/chat/send", {
    method: "POST",
    headers: { Authorization: "Bearer " + app.token },
    body: JSON.stringify({ text: "Test locking" }),
  });
  await editor.locator(".player-working").waitFor();
  await editor
    .getByRole("button", { name: "More timeline actions", exact: true })
    .click();
  assert(
    await menu.getByRole("menuitem", { name: /Remove range/ }).isDisabled(),
  );
  await page.keyboard.press("Escape");
  await emit({ type: "complete" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: pointer/I-O ranges, ripple shortcut, source clocks, atomic undo, context menu keyboard navigation and agent lock. " +
      root,
  );
} finally {
  await browser?.close();
  await app?.close();
}
