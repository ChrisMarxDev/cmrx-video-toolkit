import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { _electron: electron } = require(
  process.env.EDITOR_PLAYWRIGHT || "playwright",
);
const root = fs.mkdtempSync(
  path.join(os.homedir(), ".cache/cmrx-workspace-ui-"),
);
let app;
try {
  const options = {
    executablePath: process.env.EDITOR_ELECTRON || "/usr/bin/electron43",
    args: [
      "--user-data-dir=" + path.join(root, "profile"),
      fileURLToPath(new URL("../src/desktop.cjs", import.meta.url)),
    ],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      CHAT_PROJECTS_DIR: "",
      CHAT_WORKSPACE_DIR: "",
      CHAT_DESKTOP_TEST_PROVIDER: fileURLToPath(
        new URL("fixtures/desktop-provider.mjs", import.meta.url),
      ),
    },
  };
  app = await electron.launch(options);
  let shell = await app.firstWindow();
  const menu = () =>
    shell
      .getByRole("button", { name: "Open or create project", exact: true })
      .click();
  await app.evaluate(
    ({ dialog }) =>
      (dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })),
  );
  await menu();
  await shell
    .getByRole("button", { name: "New project…", exact: true })
    .click();
  await shell.getByLabel("Project name", { exact: true }).fill("My video");
  await shell
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  assert(await shell.getByRole("dialog").isVisible());
  assert.equal(await shell.getByRole("tab").count(), 0);
  const workspace = path.join(root, "My Studio");
  fs.mkdirSync(workspace);
  await app.evaluate(
    ({ dialog }, folder) =>
      (dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      })),
    workspace,
  );
  await shell
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await shell.getByRole("tab", { name: "My video", exact: true }).waitFor();
  const page = app
    .context()
    .pages()
    .find((p) => p.url().startsWith("http:"));
  await page.getByRole("button", { name: "Set up later", exact: true }).click();
  await page
    .getByRole("button", { name: "Open empty project", exact: true })
    .click();
  assert(fs.existsSync(path.join(workspace, "projects/My video/project.json")));
  assert(
    !fs.existsSync(path.join(workspace, "projects/My video/.cmrx-editor")),
  );
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await page.getByRole("button", { name: "Workspace", exact: true }).waitFor();
  await page.getByRole("button", { name: "Close assets", exact: true }).click();
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page
    .getByLabel("Workspace instructions", { exact: true })
    .fill("Shared workspace direction");
  await page
    .getByRole("button", { name: "Save project notes", exact: true })
    .click();
  await page.waitForTimeout(200);
  assert.equal(
    fs.readFileSync(path.join(workspace, "AGENTS.md"), "utf8"),
    "Shared workspace direction",
  );
  assert(!(await page.locator("#asset-library-choose").isVisible()));
  // Shared instructions may change in another tab. Dirty Settings must not overwrite them.
  await page
    .getByLabel("Workspace instructions", { exact: true })
    .fill("Unsaved local change");
  fs.writeFileSync(
    path.join(workspace, "AGENTS.md"),
    "Saved in another project",
  );
  await page
    .getByRole("button", { name: "Save project notes", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector("#settings-error")
      .textContent.includes("changed in another project"),
  );
  assert.equal(
    fs.readFileSync(path.join(workspace, "AGENTS.md"), "utf8"),
    "Saved in another project",
  );
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  const second = path.join(root, "Second Studio");
  fs.mkdirSync(second);
  await app.evaluate(
    ({ dialog }, folder) =>
      (dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      })),
    second,
  );
  await menu();
  await shell
    .getByRole("button", { name: "Create workspace…", exact: true })
    .click();
  await shell
    .locator("#workspace-name")
    .getByText("Second Studio", { exact: true })
    .waitFor();
  assert(fs.existsSync(path.join(second, "workspace.yaml")));
  await app.close();
  app = await electron.launch(options);
  shell = await app.firstWindow();
  await shell.getByRole("tab", { name: "My video", exact: true }).waitFor();
  await menu();
  await shell
    .locator("#workspace-name")
    .getByText("Second Studio", { exact: true })
    .waitFor();
  assert.equal(
    await shell
      .getByRole("tab", { name: "My video", exact: true })
      .getAttribute("aria-selected"),
    "false",
  );
  // Selecting the old project returns its own workspace, not the newly chosen library.
  await shell.keyboard.press("Escape");
  await shell.getByRole("tab", { name: "My video", exact: true }).click();
  await menu();
  await shell
    .locator("#workspace-name")
    .getByText("My Studio", { exact: true })
    .waitFor();
  await shell.screenshot({ path: path.join(root, "workspace-menu.png") });
  console.log(
    "PASS: first workspace picker/cancel, visible project, workspace assets/instructions, workspace creation/switch/restore, stale instruction protection and project ownership. Evidence " +
      root,
  );
} finally {
  await app?.close();
}
