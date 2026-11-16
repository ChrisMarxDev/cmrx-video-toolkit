import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createWorkspace } from "../src/workspace-library.mjs";
const { _electron } = createRequire(import.meta.url)(
  process.env.EDITOR_PLAYWRIGHT || "playwright",
);
const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-branches-native-"),
  ),
  owner = createWorkspace(path.join(root, "workspace")),
  parent = path.join(owner.folder, "projects/parent");
fs.mkdirSync(path.join(parent, ".editor"), { recursive: true });
fs.writeFileSync(
  path.join(parent, ".editor/onboarding.json"),
  '{"complete":true}',
);
fs.writeFileSync(
  path.join(parent, "project.json"),
  JSON.stringify({
    schemaVersion: 1,
    revision: 0,
    name: "Parent",
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
      parent,
    ],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      CHAT_PROJECTS_DIR: owner.folder,
      CHAT_DESKTOP_TEST_PROVIDER: fileURLToPath(
        new URL("./fixtures/branches-provider.mjs", import.meta.url),
      ),
    },
  });
  const cf = path.join(parent, ".editor/chat-connection.json");
  for (let i = 0; i < 150 && !fs.existsSync(cf); i++)
    await new Promise((r) => setTimeout(r, 100));
  const c = JSON.parse(fs.readFileSync(cf));
  const post = async (route, body) => {
    const r = await fetch(c.url + "/chat/" + route, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + c.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    assert.equal(r.ok, true, await r.clone().text());
    return r.json();
  };
  await post("login", { provider: "chatgpt" });
  await post("send", {
    text: JSON.stringify({
      requestId: "native-batch",
      projects: [
        {
          name: "child-one",
          brief: "A standalone first idea",
          script: "Independent script",
        },
        { name: "child-two", brief: "A second idea" },
      ],
    }),
  });
  const child = path.join(owner.folder, "projects/child-one");
  for (let i = 0; i < 300; i++) {
    const file = path.join(child, ".editor/chat-connection.json");
    if (fs.existsSync(file)) {
      const cc = JSON.parse(fs.readFileSync(file));
      if (
        app
          .context()
          .pages()
          .some((p) => p.url() === cc.url + "/")
      )
        break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const cc = JSON.parse(
      fs.readFileSync(path.join(child, ".editor/chat-connection.json")),
    ),
    page = app
      .context()
      .pages()
      .find((p) => p.url() === cc.url + "/");
  assert.ok(page, "Child tab renderer opened");
  await page.locator("#editor").waitFor();
  await page.locator("#start-screen").waitFor({ state: "hidden" });
  assert.equal(
    fs.readFileSync(path.join(child, "script.md"), "utf8"),
    "Independent script",
  );
  assert.ok(
    fs.existsSync(
      path.join(owner.folder, "projects/child-two/context/branch.json"),
    ),
  );
  for (let i = 0; i < 100; i++) {
    const h = JSON.parse(
      fs.readFileSync(path.join(parent, "chats/history.json")),
    );
    if (
      h.some((m) => m.role === "assistant" && m.text.includes("native-batch"))
    )
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const history = JSON.parse(
    fs.readFileSync(path.join(parent, "chats/history.json")),
  );
  assert.ok(
    history.some(
      (m) => m.role === "assistant" && m.text.includes("native-batch"),
    ),
  );
  const childHistory = path.join(child, "chats/history.json");
  if (fs.existsSync(childHistory))
    assert.deepEqual(JSON.parse(fs.readFileSync(childHistory)), []);
  console.log(
    "PASS native workspace_projects tool: batch creation, context, new project tab and original-agent/chat ownership.",
  );
} finally {
  await app?.close();
  fs.rmSync(root, { recursive: true, force: true });
}
