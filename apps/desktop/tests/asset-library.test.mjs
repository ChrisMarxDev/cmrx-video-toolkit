import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AssetLibrary } from "../src/asset-library.mjs";
import { startApp } from "../src/server.mjs";
const temp = () =>
  fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-library-test-"));
function bundle(root, name = "halo") {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "assetconfig.yaml"),
    "name: Halo\ntype: shader\ndescription: A soft ring\ntags: [glow, title]\npreview:\n  file: preview.png\n  type: image\ninstructions: SKILL.md\nlicense: MIT\nsource: https://example.com/halo\n",
  );
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    "---\nname: halo\ndescription: Paint a halo\n---\nUse src/halo.frag. Never flatten the presenter.",
  );
  fs.writeFileSync(
    path.join(dir, "preview.png"),
    Buffer.from("89504e470d0a1a0a", "hex"),
  );
  fs.writeFileSync(
    path.join(dir, "src/halo.frag"),
    "arbitrary code, not executed",
  );
  return dir;
}
test("folders, bundles, search, project copies, promotion and trash preserve sources and provenance", async () => {
  const root = temp();
  try {
    const a = new AssetLibrary({
      workspace: path.join(root, "project"),
      root: path.join(root, "profile"),
    });
    const source = bundle(a.library);
    fs.mkdirSync(path.join(a.library, "sounds"));
    fs.writeFileSync(path.join(a.library, "sounds", "bell.wav"), "sound");
    assert.equal(a.list().items.find((a) => a.bundle).name, "Halo");
    assert.equal(a.list().items.length, 2);
    assert.equal(a.list({ query: "glow" }).items.length, 1);
    assert.equal(a.list({ query: "bell" }).items[0].path, "sounds/bell.wav");
    assert(!a.list({ query: "*" }).items.some((a) => a.path.includes("src/")));
    const copy = await a.use({ scope: "library", path: "halo" });
    assert.equal(copy.workspacePath, "assets/library/halo");
    assert.match(copy.instructions, /Never flatten/);
    assert.equal(copy.license, "MIT");
    assert.equal(copy.source, "https://example.com/halo");
    fs.writeFileSync(path.join(source, "src/halo.frag"), "changed");
    assert.equal(
      fs.readFileSync(
        path.join(a.workspace, copy.workspacePath, "src/halo.frag"),
        "utf8",
      ),
      "arbitrary code, not executed",
    );
    const other = await a.use({ scope: "library", path: "halo" });
    assert.notEqual(copy.path, other.path);
    const promoted = await a.promote(copy.path);
    assert.notEqual(promoted.path, "halo");
    assert.equal(promoted.license, "MIT");
    await a.remove("library", "halo");
    assert(!fs.existsSync(source));
    assert(
      fs.existsSync(path.join(a.workspace, copy.workspacePath, "SKILL.md")),
    );
    assert.equal(
      fs.readdirSync(path.join(root, "profile", "asset-trash")).length,
      1,
    );
    const external = path.join(root, "external");
    fs.mkdirSync(external);
    a.setFolder(external);
    const reopen = new AssetLibrary({
      workspace: a.workspace,
      root: a.profile,
    });
    assert.equal(reopen.library, external);
    fs.renameSync(external, external + "-offline");
    assert(reopen.list().offline);
    assert(reopen.inspect("project", copy.path).bundle);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("broken assets remain discoverable; preview and copy paths cannot escape or execute contents", async () => {
  const root = temp();
  try {
    const a = new AssetLibrary({
      workspace: path.join(root, "project"),
      root: path.join(root, "profile"),
    });
    const source = bundle(a.library);
    fs.writeFileSync(
      path.join(source, "assetconfig.yaml"),
      "name: Bad\npreview:\n  file: ../outside.png\n  type: image\n",
    );
    assert(a.list().items[0].error);
    assert.throws(() => a.preview("library", "halo"), /relative/);
    assert.throws(() => a.file("library", "../profile"), /relative/);
    fs.symlinkSync("/etc", path.join(source, "escape"));
    await assert.rejects(a.use({ scope: "library", path: "halo" }), /regular/);
    assert.equal(
      fs.readdirSync(path.join(a.workspace, "assets", "library")).length,
      0,
    );
    fs.unlinkSync(path.join(source, "escape"));
    assert.throws(() => a.file("library", ".hidden"), /relative/);
    fs.writeFileSync(path.join(source, "assetconfig.yaml"), "[broken: yaml");
    assert(a.list().items[0].error);
    assert.equal(a.list().items[0].bundle, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("asset attachments reach the agent as independent project copies with instructions; previews require auth and support ranges", async () => {
  const root = temp();
  let app, received;
  try {
    app = await startApp({
      workspace: path.join(root, "project"),
      providerFactory: ({ onEvent }) => ({
        async start() {},
        async account() {
          return { connected: true };
        },
        async prompt(text, context) {
          received = { text, context };
          onEvent({ type: "complete" });
        },
        close() {},
      }),
    });
    bundle(app.assets.library);
    const post = async (route, body) => {
      const r = await fetch(app.url + "/chat/" + route, {
        method: "POST",
        headers: { Authorization: "Bearer " + app.token },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, 200, await r.clone().text());
      return r.json();
    };
    const url = app.url + "/chat/asset-preview?scope=library&path=halo";
    assert.equal((await fetch(url)).status, 403);
    const preview = await fetch(url, {
      headers: { Authorization: "Bearer " + app.token, Range: "bytes=0-3" },
    });
    assert.equal(preview.status, 206);
    assert.deepEqual(
      Buffer.from(await preview.arrayBuffer()),
      Buffer.from("89504e47", "hex"),
    );
    assert.match(preview.headers.get("content-security-policy"), /sandbox/);
    fs.writeFileSync(path.join(app.assets.library, "empty.mp4"), "");
    const empty = await fetch(
      app.url + "/chat/asset-preview?scope=library&path=empty.mp4",
      { headers: { Authorization: "Bearer " + app.token } },
    );
    assert.equal(empty.status, 404);
    assert.match((await empty.json()).error, /empty/);
    const state = await fetch(app.url + "/chat/state", {
      headers: { Authorization: "Bearer " + app.token },
    }).then((r) => r.json());
    assert(
      !state.error,
      "Broken previews must not mark the video edit as failed",
    );
    const selected = await post("assets-use", {
      scope: "library",
      path: "halo",
    });
    await post("login", { provider: "chatgpt" });
    await post("send", { text: "", assets: [{ path: selected.path }] });
    for (let i = 0; i < 60 && !received; i++)
      await new Promise((r) => setTimeout(r, 20));
    assert.match(received.text, /attached project assets/);
    assert.equal(
      received.context.attachedAssets[0].workspacePath,
      "assets/library/halo",
    );
    assert.match(
      received.context.attachedAssets[0].instructions,
      /Never flatten/,
    );
    assert(
      fs.existsSync(
        path.join(app.workspace, "assets/library/halo/src/halo.frag"),
      ),
    );
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
