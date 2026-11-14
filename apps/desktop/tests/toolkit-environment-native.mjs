// Actual Electron shell acceptance: checkpoint forms must not depend on window.prompt.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url),
  { _electron } = require(process.env.EDITOR_PLAYWRIGHT || "playwright");
const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-toolkit-native-"),
  ),
  workspace = path.join(root, "project");
fs.mkdirSync(path.join(workspace, ".editor"), { recursive: true });
fs.writeFileSync(
  path.join(workspace, ".editor/onboarding.json"),
  '{"complete":true}',
);
fs.writeFileSync(
  path.join(workspace, "project.json"),
  JSON.stringify({
    schemaVersion: 1,
    revision: 0,
    name: "Native toolkit project",
    width: 640,
    height: 360,
    fps: 30,
    assets: [],
    clips: [],
  }),
);
let app;
try {
  app = await _electron.launch({
    executablePath: process.env.EDITOR_ELECTRON || "/usr/bin/electron43",
    args: [
      "--user-data-dir=" + path.join(root, "profile"),
      fileURLToPath(new URL("../src/desktop.cjs", import.meta.url)),
      "--",
      "--workspace",
      workspace,
    ],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      CHAT_PROJECTS_DIR: path.join(root, "workspace"),
      CHAT_DESKTOP_TEST_PROVIDER: fileURLToPath(
        new URL("./fixtures/desktop-provider.mjs", import.meta.url),
      ),
    },
  });
  let page;
  for (let i = 0; i < 150; i++) {
    page = app
      .context()
      .pages()
      .find((p) => p.url().startsWith("http:"));
    if (page && (await page.locator("#editor").count())) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(page, "Project renderer opened");
  const f = page.frameLocator("#editor");
  await f
    .getByRole("button", { name: "More timeline actions", exact: true })
    .waitFor();
  const connection = JSON.parse(
      fs.readFileSync(path.join(workspace, ".editor/chat-connection.json")),
    ),
    call = async (route, body) => {
      const r = await fetch(connection.url + route, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization:
            "Bearer " +
            (route.startsWith("/api/")
              ? connection.editorToken
              : connection.token),
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.error);
      return v;
    };
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function history() {
    await f
      .getByRole("button", { name: "More timeline actions", exact: true })
      .click();
    await f
      .getByRole("menuitem", {
        name: "Project history & interchange…",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", { name: "Project history", exact: true })
      .waitFor();
  }
  await history();
  await page
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await page
    .getByLabel("Checkpoint name", { exact: true })
    .fill("Native checkpoint");
  await page.getByLabel("Checkpoint name", { exact: true }).press("Enter");
  await page.getByText("Native checkpoint ·", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  let p = (await call("/api/context")).project;
  fs.writeFileSync(path.join(workspace, "lib/new_note.dart"), "// Later code");
  await call("/api/project", {
    revision: p.revision,
    project: { ...p, name: "Changed after checkpoint" },
  });
  await history();
  await page
    .getByRole("button", { name: "Review restore…", exact: true })
    .click();
  await page.getByText("Remove lib/new_note.dart", { exact: false }).waitFor();
  await page
    .getByRole("button", { name: "Restore checkpoint", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Project history", exact: true })
    .waitFor({ state: "hidden" });
  p = (await call("/api/context")).project;
  assert.equal(p.name, "Native toolkit project");
  assert.equal(fs.existsSync(path.join(workspace, "lib/new_note.dart")), false);
  assert.equal(
    (await call("/chat/project-action", { action: "checkpoint-list" }))
      .checkpoints.length,
    2,
  );
  assert.deepEqual(errors, []);
  if (process.env.EDITOR_RESULTS) {
    fs.mkdirSync(process.env.EDITOR_RESULTS, { recursive: true });
    await history();
    await page.screenshot({
      path: path.join(process.env.EDITOR_RESULTS, "native-checkpoints.png"),
    });
  }
  console.log(
    "PASS actual Linux Electron: project history, DOM naming form, Enter save, review/restore source+document, safety checkpoint and no renderer errors.",
  );
} finally {
  await app?.close();
  fs.rmSync(root, { recursive: true, force: true });
}
