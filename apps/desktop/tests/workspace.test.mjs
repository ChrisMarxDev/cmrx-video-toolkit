import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  createWorkspace,
  WorkspaceLibrary,
  workspaceFor,
} from "../src/workspace-library.mjs";
import { ProjectLibrary } from "../src/project-library.mjs";
import { ProjectAgent } from "../src/project-agent.mjs";
import { AssetLibrary } from "../src/asset-library.mjs";
import { startApp } from "../src/server.mjs";
const temp = () =>
  fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "cmrx-workspace-test-",
    ),
  );

test("workspace projects have visible source, shared skills/context/assets and survive moving as a unit", async () => {
  const task = temp();
  let app;
  try {
    const root = path.join(task, "Studio"),
      profile = path.join(task, "device");
    const w = new WorkspaceLibrary(profile, root);
    assert.equal(w.current, null);
    w.select(root, { create: true });
    fs.writeFileSync(path.join(root, "AGENTS.md"), "Shared style: concise.");
    const p = new ProjectLibrary(profile).create(
      path.join(root, "projects"),
      "Film",
    );
    assert.equal(p.workspace, p.folder);
    assert.equal(p.workspaceRoot, root);
    fs.writeFileSync(path.join(p.folder, "AGENTS.md"), "Project: German.");
    fs.mkdirSync(path.join(root, "skills", "chart"));
    fs.writeFileSync(
      path.join(root, "skills/chart/SKILL.md"),
      "---\nname: chart\ndescription: Shared chart skill\n---\nUse the shared chart.",
    );
    fs.writeFileSync(
      path.join(root, "assets", "reference.txt"),
      "shared asset bytes",
    );
    const agent = new ProjectAgent({
      workspace: p.workspace,
      workspaceRoot: root,
      root: profile,
    });
    assert.match(agent.context().workspaceInstructions, /Shared style/);
    assert.match(agent.context().instructions, /German/);
    assert.match(agent.skills.read("workspace/chart").text, /shared chart/);
    agent.skills.write("AGENTS.md", "Revised shared style.", "workspace");
    assert.throws(
      () =>
        agent.skills.write(
          "AGENTS.md",
          "stale",
          "workspace",
          "old instructions",
        ),
      /changed in another project/,
    );
    assert.throws(
      () => new ProjectLibrary(profile).open(path.join(root, "assets")),
      /inside the workspace projects folder/,
    );
    assert.equal(
      fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"),
      "Revised shared style.",
    );
    const assets = new AssetLibrary({
      workspace: p.workspace,
      workspaceRoot: root,
      root: profile,
    });
    assert.equal(assets.settings().folder, path.join(root, "assets"));
    assert.equal(assets.settings().workspaceOwned, true);
    assert.throws(() => assets.setFolder(task), /belong to this workspace/);
    await assets.use({ scope: "library", path: "reference.txt" });
    const providerFactory = ({ onEvent }) => ({
      async start() {},
      async account() {
        return { connected: true };
      },
      async models() {
        return [];
      },
      async prompt() {
        onEvent({ type: "delta", text: "Portable reply", itemId: "reply" });
        onEvent({ type: "complete" });
      },
      close() {},
    });
    app = await startApp({
      workspace: p.folder,
      workspaceRoot: root,
      agentRoot: profile,
      providerFactory,
    });
    await app.ready;
    const headers = { Authorization: "Bearer " + app.token };
    await fetch(app.url + "/chat/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ provider: "chatgpt" }),
    });
    assert.equal(
      (
        await fetch(app.url + "/chat/send", {
          method: "POST",
          headers,
          body: JSON.stringify({ text: "Remember this project" }),
        })
      ).status,
      200,
    );
    for (let i = 0; i < 200; i++) {
      if (
        fs.existsSync(path.join(p.folder, "chats/history.json")) &&
        fs
          .readFileSync(path.join(p.folder, "chats/history.json"), "utf8")
          .includes("Portable reply")
      )
        break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.match(
      fs.readFileSync(path.join(p.folder, "chats/history.json"), "utf8"),
      /Portable reply/,
    );
    await app.close();
    app = null;
    execFileSync("git", ["init", "--quiet", root]);
    assert.equal(
      execFileSync(
        "git",
        ["-C", root, "check-ignore", "projects/Film/.editor/connection.json"],
        { encoding: "utf8" },
      ).trim(),
      "projects/Film/.editor/connection.json",
    );
    const copy = path.join(task, "Moved Studio");
    fs.cpSync(root, copy, {
      recursive: true,
      filter: (f) => ![".git", ".editor"].includes(path.basename(f)),
    });
    const reopened = new ProjectLibrary(path.join(task, "new-device")).open(
      path.join(copy, "projects", "Film"),
    );
    assert.equal(reopened.workspaceRoot, copy);
    assert.equal(reopened.workspace, reopened.folder);
    const other = new ProjectAgent({
      workspace: reopened.workspace,
      workspaceRoot: copy,
      root: path.join(task, "new-device"),
    });
    assert.equal(
      other.skills.read("workspace/chart").workerPath,
      "/skills/chart",
    );
    assert.match(other.context().workspaceInstructions, /Revised/);
    assert.match(
      fs.readFileSync(path.join(reopened.folder, "chats/history.json"), "utf8"),
      /Portable reply/,
    );
    assert(
      fs.existsSync(path.join(reopened.folder, "assets/library/reference.txt")),
    );
    assert(
      !fs.existsSync(
        path.join(copy, "projects", "Film", ".editor", "connection.json"),
      ),
    );
    app = await startApp({
      workspace: reopened.folder,
      workspaceRoot: copy,
      agentRoot: path.join(task, "new-device"),
      providerFactory,
    });
    await app.ready;
    assert.match(JSON.stringify(app.state.messages), /Portable reply/);
    assert.equal(app.state.connected, false);
    assert.equal(app.assets.settings().folder, path.join(copy, "assets"));
    assert.equal(new WorkspaceLibrary(profile, root).ensure().folder, root);
  } finally {
    await app?.close();
    fs.rmSync(task, { recursive: true, force: true });
  }
});

test("workspace roots reject escaped folders and corrupt configuration; shared libraries do not cross workspaces", () => {
  const task = temp();
  try {
    const a = path.join(task, "A"),
      b = path.join(task, "B");
    createWorkspace(a);
    createWorkspace(b);
    const project = path.join(a, "projects", "One");
    fs.mkdirSync(project);
    assert.equal(workspaceFor(project).folder, a);
    const first = new AssetLibrary({
      workspace: project,
      workspaceRoot: a,
      root: path.join(task, "device"),
    });
    const second = new AssetLibrary({
      workspace: project,
      workspaceRoot: b,
      root: path.join(task, "device"),
    });
    fs.writeFileSync(path.join(a, "assets", "only-a.txt"), "A");
    assert(
      first
        .list({ scope: "library" })
        .items.some((i) => i.name === "only-a.txt"),
    );
    assert(
      !second
        .list({ scope: "library" })
        .items.some((i) => i.name === "only-a.txt"),
    );
    fs.rmSync(path.join(b, "skills"), { recursive: true });
    fs.symlinkSync(path.join(a, "skills"), path.join(b, "skills"));
    assert.throws(() => createWorkspace(b), /symlink/);
    fs.writeFileSync(
      path.join(a, "workspace.yaml"),
      "schemaVersion: 99\nname: A",
    );
    assert.throws(() => workspaceFor(project), /Invalid workspace/);
  } finally {
    fs.rmSync(task, { recursive: true, force: true });
  }
});
