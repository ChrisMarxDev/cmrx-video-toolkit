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
    executablePath: process.env.EDITOR_PACKAGED_APP
      ? path.join(
          process.env.EDITOR_PACKAGED_APP,
          "Contents/MacOS/CMRX Chat Editor",
        )
      : process.env.EDITOR_ELECTRON || "/usr/bin/electron43",
    args: [
      "--user-data-dir=" + path.join(root, "profile"),
      ...(process.env.EDITOR_PACKAGED_APP
        ? []
        : [fileURLToPath(new URL("../src/desktop.cjs", import.meta.url))]),
    ],
    // Keep the OS login Keychain available; userData and provider accounts are isolated.
    // The render smoke test separately runs with a fresh HOME and no developer tools.
    env: {
      ...(process.env.EDITOR_PACKAGED_APP
        ? {
            HOME: os.homedir(),
            PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
            DEVELOPER_DIR: "/cmrx-no-developer-tools",
          }
        : process.env),
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
  const customSkill = path.join(root, "custom-skill");
  fs.mkdirSync(customSkill);
  fs.writeFileSync(
    path.join(customSkill, "SKILL.md"),
    "---\nname: beta-custom\ndescription: A custom local beta skill\n---\nUse a lime accent in the video.\n",
  );
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, customSkill);
  await page
    .getByRole("button", { name: "Add skill folder", exact: true })
    .click();
  await page
    .locator(".skill-card")
    .filter({ hasText: "beta-custom" })
    .waitFor();
  assert(
    fs.existsSync(path.join(root, "projects/skills/beta-custom/SKILL.md")),
  );
  await page.screenshot({ path: path.join(root, "custom-skill.png") });
  await page.locator("#settings-close").click();
  const customAsset =
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="35" fill="#d5ff45"/></svg>';
  await page.evaluate((svg) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([svg], "beta-asset.svg", { type: "image/svg+xml" }),
    );
    document.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
  }, customAsset);
  await page
    .locator("#asset-import-status")
    .getByText("Added: beta-asset.svg", { exact: true })
    .waitFor();
  const importedRoot = path.join(
    root,
    "projects/projects/First video/assets/imports",
  );
  const importedFile = fs
    .readdirSync(importedRoot)
    .find((n) => n.endsWith("-beta-asset.svg"));
  assert.equal(
    fs.readFileSync(path.join(importedRoot, importedFile), "utf8"),
    customAsset,
  );
  await shell.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("#prompt").fill("Draft a short opening");
  await page.locator("#prompt").press("Enter");
  await shell.locator(".dot.working").first().waitFor();
  assert.equal(
    await shell
      .locator(".dot.working")
      .first()
      .evaluate((el) => getComputedStyle(el, "::before").animationName),
    "matrix-cells",
  );
  await shell.locator(".dot.working").waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: native animated stepper, back/skip/connect, canceled picker, real video import/filmstrip, replay, reduced motion and preserved project. Evidence " +
      root,
  );
} finally {
  await app?.close();
}
