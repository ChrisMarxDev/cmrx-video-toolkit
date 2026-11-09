import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url),
  { _electron: electron } = require(
    process.env.EDITOR_PLAYWRIGHT || "playwright",
  );
const root = fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-stepper-ui-"));
const video = process.env.CHAT_TEST_VIDEO || path.join(root, "footage.mp4");
if (!process.env.CHAT_TEST_VIDEO)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=640x360:r=24:d=4",
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
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      CHAT_PROJECTS_DIR: path.join(root, "projects"),
      CHAT_DESKTOP_TEST_PROVIDER: fileURLToPath(
        new URL("fixtures/desktop-provider.mjs", import.meta.url),
      ),
    },
  });
  const shell = await app.firstWindow();
  await shell
    .getByRole("button", { name: "Open or create project", exact: true })
    .click();
  await shell
    .getByRole("button", { name: "New project…", exact: true })
    .click();
  await shell.getByLabel("Project name", { exact: true }).fill("First video");
  await shell
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  let page;
  for (let i = 0; i < 100 && !page; i++) {
    page = app
      .context()
      .pages()
      .find((p) => p.url().startsWith("http:"));
    if (!page) await new Promise((r) => setTimeout(r, 50));
  }
  assert(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("heading", { name: "Connect your account.", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("navigation", { name: "Setup steps" })
      .getByRole("button")
      .count(),
    2,
  );
  assert(!(await page.locator("#setup-back").isVisible()));
  await page.getByRole("button", { name: "Set up later", exact: true }).click();
  await page
    .getByRole("heading", { name: "Start your video.", exact: true })
    .waitFor();
  assert.equal(
    await page.locator("#first-video").textContent(),
    "Upload a video",
  );
  assert.equal(
    await page.locator("#start-blank").textContent(),
    "Open empty project",
  );
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await page
    .locator("#start-providers")
    .getByRole("button", { name: "Connect ChatGPT", exact: true })
    .click();
  await page
    .locator("#start-providers")
    .getByText("Connected", { exact: true })
    .waitFor();
  await page.locator("#account-next").click();
  await page.waitForTimeout(320);
  await page.screenshot({ path: path.join(root, "start.png") });
  await app.evaluate(
    ({ dialog }) =>
      (dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })),
  );
  await page.locator("#first-video").click();
  await page.waitForTimeout(100);
  assert(await page.locator("#start-screen").isVisible());
  assert.equal(
    JSON.parse(
      fs.readFileSync(
        path.join(root, "projects/projects/First video/project.json"),
      ),
    ).clips.length,
    0,
  );
  await app.evaluate(
    ({ dialog }, video) =>
      (dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [video],
      })),
    video,
  );
  await page.locator("#first-video").click();
  await page
    .locator("#start-screen")
    .waitFor({ state: "hidden", timeout: 30000 });
  const editor = page.frame({ name: "editor" });
  await editor
    .locator(".clip-media[data-ready=true]")
    .waitFor({ timeout: 30000 });
  await page.screenshot({ path: path.join(root, "footage-timeline.png") });
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run setup again", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Connect your account.", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(root, "account.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#account-next").click();
  assert.equal(
    await page
      .locator("#start-video")
      .evaluate((el) => el.getAnimations().length),
    0,
  );
  assert.equal(await page.locator(".setup-choices button").count(), 2);
  assert.equal(
    await page.locator("#start-blank").textContent(),
    "Open project",
  );
  await page.locator("#start-blank").click();
  await page.locator("#start-screen").waitFor({ state: "hidden" });
  assert.equal(
    JSON.parse(
      fs.readFileSync(
        path.join(root, "projects/projects/First video/project.json"),
      ),
    ).clips.length,
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: native animated stepper, back/skip/connect, canceled picker, real video import/filmstrip, replay, reduced motion and preserved project. Evidence " +
      root,
  );
} finally {
  await app?.close();
}
