import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url),
  { _electron: electron } = require(
    process.env.EDITOR_PLAYWRIGHT || "playwright",
  );
const root = fs.mkdtempSync(
  path.join(os.homedir(), ".cache/cmrx-native-tabs-"),
);
let app;
const launch = () =>
  electron.launch({
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
        new URL("./fixtures/desktop-provider.mjs", import.meta.url),
      ),
    },
  });
const view = async (name) => {
  for (let i = 0; i < 100; i++) {
    for (const p of app.context().pages())
      if (
        p.url().startsWith("http:") &&
        (await p.locator("#project-open").count())
      ) {
        if ((await p.locator("#project-open").textContent()) === name) return p;
      }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Missing view " + name);
};
try {
  app = await launch();
  await app.evaluate(({ app }, root) => app.setPath("documents", root), root);
  let shell = await app.firstWindow();
  await shell
    .getByRole("button", { name: "Open or create project", exact: true })
    .waitFor();
  assert.equal(await shell.getByRole("tab").count(), 0);
  async function create(name) {
    await shell
      .getByRole("button", { name: "Open or create project", exact: true })
      .click();
    await shell
      .getByRole("button", { name: "New project…", exact: true })
      .click();
    await shell.getByLabel("Project name", { exact: true }).fill(name);
    await shell
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await shell.getByRole("tab", { name, exact: true }).waitFor();
    const page = await view(name);
    await page
      .getByRole("button", { name: "Set up later", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Open empty project",
        exact: false,
      })
      .click();
    await page.waitForFunction(() => document.activeElement?.id === "prompt");
    return page;
  }
  const a = await create("Alpha");
  const initial = JSON.parse(
    fs.readFileSync(
      path.join(root, "projects/Alpha/.cmrx-editor/project.json"),
    ),
  );
  assert.equal(initial.name, "Alpha");
  assert.deepEqual([initial.width, initial.height], [1920, 1080]);
  await a
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("draft alpha");
  await a.waitForTimeout(400);
  const b = await create("Beta");
  await b
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("draft beta");
  await b.waitForTimeout(400);
  await shell.getByRole("tab", { name: "Alpha", exact: true }).click();
  await shell
    .getByRole("tab", { name: "Beta", exact: true })
    .locator("..")
    .dragTo(
      shell.getByRole("tab", { name: "Alpha", exact: true }).locator(".."),
    );
  assert.deepEqual(await shell.getByRole("tab").allTextContents(), [
    "Beta",
    "Alpha",
  ]);
  assert.equal(
    await a.getByRole("textbox", { name: "Message", exact: true }).inputValue(),
    "draft alpha",
  );
  await a.getByRole("button", { name: "Open settings", exact: true }).click();
  await a
    .getByRole("dialog", { name: "Settings" })
    .getByRole("button", { name: "Connect ChatGPT", exact: true })
    .click();
  await a
    .getByRole("dialog", { name: "Settings" })
    .getByText("Connected", { exact: true })
    .waitFor();
  await a.getByRole("button", { name: "Close settings", exact: true }).click();
  await a
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("alpha-only");
  await a.getByRole("button", { name: "Send message", exact: true }).click();
  await shell.getByRole("tab", { name: "Beta", exact: true }).click();
  await a
    .getByText("Saved this project script.", { exact: true })
    .waitFor({ timeout: 20000, state: "attached" });
  assert.equal(
    await b.getByRole("textbox", { name: "Message", exact: true }).inputValue(),
    "draft beta",
  );
  await b.waitForFunction(
    () => !document.querySelector("#send").disabled,
    {},
    { timeout: 20000 },
  );
  assert.equal(
    await b.getByText("Saved this project script.", { exact: true }).count(),
    0,
  );
  await shell.getByRole("tab", { name: "Alpha", exact: true }).click();
  await shell.screenshot({ path: path.join(root, "tabs.png") });
  await a.screenshot({ path: path.join(root, "active-project.png") });
  console.log(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].contentView.children.map((v) => ({
        visible: v.getVisible(),
        bounds: v.getBounds(),
      })),
    ),
  );
  const sessionPath = path.join(root, "profile", "open-projects.json");
  const before = JSON.parse(fs.readFileSync(sessionPath));
  assert.equal(before.folders.length, 2);
  // Folder picker stub emulates choosing the same on-disk project, ensuring dedup.
  await app.evaluate(
    ({ dialog }, folder) =>
      (dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder],
      })),
    path.join(root, "projects/Alpha"),
  );
  await shell
    .getByRole("button", { name: "Open or create project", exact: true })
    .click();
  await shell
    .getByRole("button", { name: "Open folder…", exact: true })
    .click();
  assert.equal(await shell.getByRole("tab").count(), 2);
  // Busy close offers Keep open; no worker or project is destroyed.
  await a
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("second alpha");
  await a.getByRole("button", { name: "Send message", exact: true }).click();
  await app.evaluate(
    ({ dialog }) => (dialog.showMessageBox = async () => ({ response: 0 })),
  );
  await shell.getByRole("button", { name: "Close Alpha", exact: true }).click();
  assert.equal(await shell.getByRole("tab").count(), 2);
  await a.waitForTimeout(2300);
  const editor = a.frame({ name: "editor" });
  await editor
    .getByRole("slider", { name: "Timeline playhead", exact: true })
    .press("End");
  await editor
    .getByRole("slider", { name: "Timeline playhead", exact: true })
    .press("ArrowLeft");
  const savedTime = Number(
    await editor
      .getByRole("slider", { name: "Timeline playhead", exact: true })
      .getAttribute("aria-valuenow"),
  );
  await a.waitForTimeout(400);
  await app.close();
  app = await launch();
  shell = await app.firstWindow();
  await shell
    .getByRole("tab", { name: "Alpha", exact: true })
    .waitFor({ timeout: 30000 });
  await shell.getByRole("tab", { name: "Beta", exact: true }).waitFor();
  assert.equal(
    await shell
      .getByRole("tab", { name: "Alpha", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  const reopenedB = await view("Beta");
  assert.equal(
    await reopenedB
      .getByRole("textbox", { name: "Message", exact: true })
      .inputValue(),
    "draft beta",
  );
  const reopenedA = await view("Alpha");
  await reopenedA
    .frame({ name: "editor" })
    .getByRole("slider", { name: "Timeline playhead", exact: true })
    .waitFor();
  assert.equal(
    Number(
      await reopenedA
        .frame({ name: "editor" })
        .getByRole("slider", { name: "Timeline playhead", exact: true })
        .getAttribute("aria-valuenow"),
    ),
    savedTime,
  );
  await reopenedA
    .getByRole("button", { name: "Connect ChatGPT", exact: true })
    .waitFor();
  await reopenedA
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await reopenedA
    .getByRole("dialog", { name: "Settings" })
    .getByRole("button", { name: "Connect ChatGPT", exact: true })
    .click();
  await reopenedA
    .getByRole("dialog", { name: "Settings" })
    .getByText("Connected", { exact: true })
    .waitFor();
  await reopenedA
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await reopenedA
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("must-not-run");
  await reopenedA
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await app.evaluate(
    ({ dialog }) => (dialog.showMessageBox = async () => ({ response: 1 })),
  );
  await shell.getByRole("button", { name: "Close Alpha", exact: true }).click();
  await reopenedB.waitForTimeout(2300);
  assert(
    !fs
      .readFileSync(
        path.join(root, "projects/Alpha/.cmrx-editor/script.md"),
        "utf8",
      )
      .includes("must-not-run"),
  );
  await shell.getByRole("button", { name: "Close Beta", exact: true }).click();
  await shell
    .getByRole("button", { name: "Open project +", exact: true })
    .waitFor();
  assert.equal(JSON.parse(fs.readFileSync(sessionPath)).folders.length, 0);
  assert(fs.existsSync(before.folders[0]));
  console.log(
    "PASS: native create/open/deduplicate, isolated drafts, background agent, shared account, busy-close, restoration and empty state. Evidence " +
      root,
  );
} finally {
  await app?.close();
}
