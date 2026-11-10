import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { startApp } from "../src/server.mjs";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.EDITOR_PLAYWRIGHT || "playwright");
const root = fs.mkdtempSync(
  path.join(os.homedir(), ".cache/cmrx-preview-controls-ui-"),
);
let app, browser, finishAgent, connection;
try {
  if (process.env.CHAT_TEST_PREVIEW_CONNECTION) {
    connection = JSON.parse(
      fs.readFileSync(process.env.CHAT_TEST_PREVIEW_CONNECTION),
    );
    assert.equal(
      connection.fixture,
      "preview-controls",
      "Only connect this test to an isolated preview-controls fixture",
    );
  } else {
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(path.join(workspace, "media"), { recursive: true });
    fs.mkdirSync(path.join(workspace, ".editor"));
    const ff = (args) =>
      execFileSync("ffmpeg", ["-v", "error", ...args], { stdio: "pipe" });
    ff([
      "-f",
      "lavfi",
      "-i",
      "color=gray:s=320x180:r=12:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-c:a",
      "aac",
      "-pix_fmt",
      "yuv420p",
      "-shortest",
      path.join(workspace, "media/source.mp4"),
    ]);
    const project = {
      schemaVersion: 1,
      revision: 0,
      name: "Preview controls",
      width: 320,
      height: 180,
      fps: 12,
      assets: [
        {
          id: "source",
          name: "Source",
          path: "media/source.mp4",
          duration: 2,
          audio: true,
        },
      ],
      clips: [
        {
          id: "footage",
          name: "Footage",
          kind: "video",
          assetId: "source",
          start: 0,
          in: 0,
          duration: 2,
          track: 0,
          x: 0,
          y: 0,
          width: 320,
          height: 180,
          muted: false,
        },
        ...[1, 2].map((track) => ({
          id: "graphics-" + track,
          name: track === 1 ? "Red" : "Blue",
          kind: "graphics",
          start: 0,
          in: 0,
          duration: 2,
          track,
          x: track === 1 ? 0 : 160,
          y: 0,
          width: 160,
          height: 180,
          muted: false,
          props: { source: "lib/graphics.dart" },
        })),
      ],
      layers: {},
      comments: [],
    };
    fs.writeFileSync(
      path.join(workspace, "project.json"),
      JSON.stringify(project),
    );
    fs.writeFileSync(
      path.join(workspace, ".editor/onboarding.json"),
      '{"complete":true}',
    );
    app = await startApp({
      workspace,
      autoPreview: false,
      providerFactory: ({ onEvent }) => ({
        async start() {},
        async account() {
          return { connected: true };
        },
        async models() {
          return [{ id: "test", name: "Test", isDefault: true }];
        },
        async prompt() {
          await new Promise((r) => (finishAgent = r));
          onEvent({ type: "complete" });
        },
        close() {
          finishAgent?.();
        },
      }),
    });
    await app.ready;
    const dir = path.join(workspace, ".editor/playground", "fixture");
    fs.mkdirSync(dir);
    for (const [track, color, x] of [
      [1, "0xEE2020", 0],
      [2, "0x2040EE", 160],
    ])
      ff([
        "-f",
        "lavfi",
        "-i",
        `color=black@0:s=320x180:r=12:d=2,format=rgba,drawbox=x=${x}:y=0:w=160:h=180:color=${color}@1:t=fill:replace=1`,
        "-c:v",
        "libvpx-vp9",
        "-threads",
        "1",
        "-pix_fmt",
        "yuva420p",
        "-auto-alt-ref",
        "0",
        path.join(dir, `overlay_track_${track}.webm`),
      ]);
    fs.copyFileSync(
      path.join(dir, "overlay_track_1.webm"),
      path.join(dir, "overlay.webm"),
    );
    fs.copyFileSync(
      path.join(workspace, "media/source.mp4"),
      path.join(dir, "preview.mp4"),
    );
    app.playground.jobs.push({
      id: "fixture",
      kind: "export",
      status: "complete",
      duration: 2,
      width: 320,
      height: 180,
      overlay: true,
      artifact: true,
      previewTracks: [1, 2],
      fingerprint: app.playground.fingerprint(),
    });
    app.playground.persist();
    connection = {
      url: app.url,
      token: app.token,
      editorToken: app.editorToken,
      workspace,
    };
  }
  const { url, token, editorToken, workspace } = connection;
  const post = (route, body = {}) =>
    fetch(url + "/chat/" + route, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: JSON.stringify(body),
    });
  await post("login", { provider: "chatgpt" });
  browser = await chromium.launch({
    executablePath: process.env.EDITOR_CHROMIUM || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    }),
    errors = [];
  let writes = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    if (
      r.method() === "POST" &&
      p.startsWith("/api/") &&
      p !== "/api/selection"
    )
      writes++;
  });
  await page.goto(url + "/#token=" + token + "&editorToken=" + editorToken);
  const editor = page.frameLocator("#editor");
  await editor
    .locator('.layer-controls button[aria-label="Hide layer 1"]')
    .waitFor({ state: "attached" });
  const inspectLayer = async (name) => {
    const track = name.match(/layer (\d+)/)[1];
    await editor
      .locator(`[data-track="${track}"] [data-clip]`)
      .first()
      .click({ button: "right" });
    await editor.getByRole("menuitem", { name, exact: true }).click();
  };
  const projectFile = path.join(workspace, "project.json"),
    before = fs.readFileSync(projectFile, "utf8");
  const state = await fetch(url + "/chat/state", {
    headers: { Authorization: "Bearer " + token },
  }).then((r) => r.json());
  const exportJob = state.jobs.findLast(
    (j) => j.artifact && j.status === "complete",
  );
  const exportFile = path.join(
    workspace,
    ".editor/playground",
    exportJob.id,
    "preview.mp4",
  );
  const sha = () =>
    createHash("sha256").update(fs.readFileSync(exportFile)).digest("hex");
  const beforeExport = sha();
  let renderRequests = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/chat/render"
    )
      renderRequests++;
  });
  const downloadPromise = page.waitForEvent("download");
  await editor
    .getByRole("button", { name: "More timeline actions", exact: true })
    .click();
  await editor
    .getByRole("menuitem", { name: "Export video", exact: true })
    .click();
  const download = await downloadPromise;
  const downloaded = await download.path();
  assert.equal(
    createHash("sha256").update(fs.readFileSync(downloaded)).digest("hex"),
    beforeExport,
  );
  assert.equal(
    renderRequests,
    0,
    "Fresh exports download without rendering again",
  );

  await editor.locator(".stage video").first().waitFor();
  const seek = async () => {
    const ruler = editor.getByRole("slider", {
      name: "Timeline playhead",
      exact: true,
    });
    await ruler.click({ position: { x: 40, y: 8 } });
    await editor.locator(".stage").evaluate(async (stage) => {
      await Promise.all(
        [...stage.querySelectorAll("video")].map(
          (v) =>
            new Promise((resolve) => {
              if (v.readyState >= 2) resolve();
              else v.addEventListener("loadeddata", resolve, { once: true });
            }),
        ),
      );
    });
  };
  const pixels = () =>
    editor.locator(".stage").evaluate((stage) => {
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 180;
      const ctx = c.getContext("2d");
      for (const v of stage.querySelectorAll("video"))
        if (getComputedStyle(v).display !== "none" && v.readyState >= 2)
          ctx.drawImage(v, 0, 0, 320, 180);
      return [
        Array.from(ctx.getImageData(80, 90, 1, 1).data),
        Array.from(ctx.getImageData(240, 90, 1, 1).data),
      ];
    });
  const red = (p) => p[0] > 150 && p[0] > p[1] * 2 && p[0] > p[2] * 2;
  const blue = (p) => p[2] > 150 && p[2] > p[0] * 2 && p[2] > p[1] * 2;
  const gray = (p) =>
    Math.abs(p[0] - p[1]) < 20 && Math.abs(p[1] - p[2]) < 20 && p[0] > 70;
  await seek();
  let colors = await pixels();
  assert(red(colors[0]) && blue(colors[1]), JSON.stringify(colors));
  await post("send", { text: "Hold the agent busy while I inspect layers" });
  await page.waitForFunction(
    () =>
      document.querySelector("#stop") &&
      !document.querySelector("#stop").hidden,
  );
  assert(
    await editor
      .getByRole("button", { name: "Split", exact: true })
      .isDisabled(),
  );
  const controls = [
    ["Mute layer 0", "Unmute layer 0"],
    ["Hide layer 1", "Show layer 1"],
    ["Hide layer 2", "Show layer 2"],
  ];
  for (const [name] of controls)
    assert(
      await editor
        .locator(`.layer-controls button[aria-label="${name}"]`)
        .isEnabled(),
    );
  await inspectLayer("Mute layer 0");
  assert(
    await editor
      .locator(".stage video:not([data-overlay])")
      .evaluate((v) => v.muted),
  );
  await inspectLayer("Hide layer 1");
  await seek();
  colors = await pixels();
  assert(gray(colors[0]) && blue(colors[1]), JSON.stringify(colors));
  await inspectLayer("Show layer 1");
  await inspectLayer("Hide layer 2");
  await seek();
  colors = await pixels();
  assert(red(colors[0]) && gray(colors[1]), JSON.stringify(colors));
  await inspectLayer("Hide layer 0");
  assert.equal(
    await editor.locator(".stage video:not([data-overlay])").count(),
    0,
  );
  await inspectLayer("Show layer 0");
  await editor.locator('[data-clip="footage"]').focus();
  await page.keyboard.press("Shift+M");
  assert.equal(
    await editor
      .locator('.layer-controls button[aria-label="Mute layer 0"]')
      .getAttribute("aria-pressed"),
    "false",
  );
  await page.keyboard.press("Shift+V");
  assert(
    await editor
      .locator('.layer-controls button[aria-label="Show layer 0"]')
      .isEnabled(),
  );
  assert.equal(fs.readFileSync(projectFile, "utf8"), before);
  assert.equal(sha(), beforeExport);
  assert.equal(writes, 0);
  assert.equal(
    (
      await fetch(url + "/api/layer", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + editorToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ revision: 0, track: 0, patch: { muted: true } }),
      })
    ).status,
    423,
  );
  assert.equal(fs.readFileSync(projectFile, "utf8"), before);
  await page.screenshot({
    path: path.join(root, "controls-during-agent-work.png"),
  });
  assert.deepEqual(errors, []);
  if (process.env.CHAT_TEST_PREVIEW_CONNECTION) {
    const rgb = execFileSync("ffmpeg", [
      "-v",
      "error",
      "-ss",
      "0.5",
      "-i",
      exportFile,
      "-frames:v",
      "1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ]);
    assert(
      red([...rgb.subarray((90 * 320 + 80) * 3, (90 * 320 + 80) * 3 + 3)]),
    );
    assert(
      blue([...rgb.subarray((90 * 320 + 240) * 3, (90 * 320 + 240) * 3 + 3)]),
    );
  }
  console.log(
    "PASS: preview-only mute/hide/shortcuts/seeking during agent work, independent red/blue alpha layers, unchanged project/export and retained mutation lock. Evidence " +
      root,
  );
} finally {
  finishAgent?.();
  await browser?.close();
  await app?.close();
}
