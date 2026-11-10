import { createRequire } from "node:module";
import os from "node:os";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { _electron: electron } = require(
  process.env.EDITOR_PLAYWRIGHT || "playwright",
);
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const results =
  process.env.EDITOR_RESULTS ||
  path.join(os.homedir(), ".cache/cmrx-first-run-results");
fs.mkdirSync(results, { recursive: true });
const root = path.join(results, "desktop-" + Date.now());
fs.mkdirSync(root, { recursive: true });
const project = path.join(root, "First film");
fs.mkdirSync(project);
const video = process.env.CHAT_TEST_VIDEO || path.join(root, "recording.mp4");
if (!process.env.CHAT_TEST_VIDEO)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=purple:s=720x1280:r=30:d=4",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-pix_fmt",
    "yuv420p",
    video,
  ]);
let app;
try {
  app = await electron.launch({
    executablePath: process.env.EDITOR_ELECTRON || "/usr/bin/electron43",
    args: [
      "--user-data-dir=" + path.join(root, "profile"),
      fileURLToPath(new URL("../src/desktop.cjs", import.meta.url)),
    ],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
  });
  app.on("close", () => console.log("Electron closed"));
  app
    .process()
    .stderr?.on("data", (d) =>
      console.log("Electron stderr:", d.toString().slice(0, 500)),
    );
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "Choose folder", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(results, "01-folder.png") });
  await app.evaluate(
    ({ dialog, shell }, { project, video }) => {
      let n = 0;
      globalThis.picked = [];
      dialog.showOpenDialog = async (win, options) => {
        globalThis.picked.push(options.properties);
        return {
          canceled: false,
          filePaths: [
            options.properties.includes("openDirectory") ? project : video,
          ],
        };
      };
      shell.openExternal = async (url) => {
        globalThis.authHost = new URL(url).hostname;
      };
    },
    { project, video },
  );
  await page
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Bring your subscription", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(results, "02-account.png") });
  if (process.env.CHAT_TEST_NATIVE_AUTH === "1") {
    await page
      .locator("#start-screen")
      .getByRole("button", { name: "Connect ChatGPT", exact: true })
      .click();
    await page
      .locator("#start-providers .auth-link")
      .first()
      .waitFor({ state: "visible", timeout: 90000 });
    assert.equal(
      await app.evaluate(() => globalThis.authHost),
      "auth.openai.com",
    );
    await page
      .getByRole("button", { name: "Cancel sign-in", exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Set up later", exact: true }).click();
  await page.getByRole("button", { name: "Choose video", exact: true }).click();
  await page
    .locator("#start-screen")
    .waitFor({ state: "hidden", timeout: 30000 });
  const frame = page.frames().find((f) => f.parentFrame() === page.mainFrame());
  await frame.waitForFunction(
    () => document.querySelector(".stage video")?.readyState >= 2,
  );
  if (!process.env.CHAT_TEST_VIDEO)
    assert.deepEqual(
      await frame
        .locator(".stage video")
        .first()
        .evaluate((v) => [v.videoWidth, v.videoHeight]),
      [720, 1280],
    );
  const cardBounds = await frame.locator("[data-clip]").first().boundingBox();
  const timelineBounds = await frame.locator(".timeline-scroll").boundingBox();
  assert(
    cardBounds.x + cardBounds.width <=
      timelineBounds.x + timelineBounds.width + 2,
    "First video should fit in the timeline without manual zoom",
  );
  const document = JSON.parse(
    fs.readFileSync(path.join(project, ".cmrx-editor/project.json")),
  );
  assert.equal(document.assets[0].provenance.playback, "Exact source copy");
  await frame
    .getByRole("button", { name: "Comment here", exact: true })
    .click();
  await frame
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill("Please shorten this pause");
  await frame
    .getByRole("textbox", { name: "Comment", exact: true })
    .press("Enter");
  await page
    .locator("#comment-attachments")
    .getByRole("button", {
      name: /Open comment at .*Please shorten this pause/,
    })
    .waitFor();
  const timestamp = page.locator("#comment-attachments button");
  assert.match(await timestamp.innerText(), /^\d{2}:\d{2}\.\d{2}$/);
  await timestamp.click();
  await frame.locator("[data-comment]:focus").waitFor();
  await page.waitForTimeout(500);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(project, ".cmrx-editor/project.json")))
      .comments.length,
    1,
  );
  await page.screenshot({ path: path.join(results, "03-editor.png") });
  await app.close();
  app = await electron.launch({
    executablePath: process.env.EDITOR_ELECTRON || "/usr/bin/electron43",
    args: [
      "--user-data-dir=" + path.join(root, "profile"),
      fileURLToPath(new URL("../src/desktop.cjs", import.meta.url)),
    ],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
  });
  const reopened = await app.firstWindow();
  await reopened
    .locator("#recent-projects")
    .getByRole("button", { name: "First film", exact: true })
    .click();
  await reopened.locator("#start-screen").waitFor({ state: "hidden" });
  assert.equal(await reopened.locator("#send").isDisabled(), true);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(project, ".cmrx-editor/project.json")))
      .comments.length,
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      root,
      project,
      nativeDialogs: true,
      reopen: true,
      nativeAuth: process.env.CHAT_TEST_NATIVE_AUTH === "1",
      onboarding: true,
      portrait: true,
      comment: true,
    }),
  );
} catch (e) {
  console.error("TEST FAILURE", e.message);
  throw e;
} finally {
  await Promise.race([app?.close(), new Promise((r) => setTimeout(r, 2000))]);
  fs.rmSync(root, { recursive: true, force: true });
}
