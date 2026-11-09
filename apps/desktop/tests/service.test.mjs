import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startApp } from "../src/server.mjs";
import { executeTool } from "../src/tools.mjs";
test("real editor: authenticated chat, streamed tool edit, revision conflicts, undo and saved chat", async () => {
  const root = fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "chat-editor-test-",
    ),
  );
  const fixture = {
    schemaVersion: 1,
    revision: 0,
    name: "Test",
    width: 640,
    height: 360,
    fps: 24,
    assets: [],
    clips: [
      {
        id: "graphic",
        kind: "unknown",
        name: "Graphic",
        start: 0,
        in: 0,
        duration: 4,
        track: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        muted: true,
        props: { preserve: "yes" },
      },
    ],
  };
  fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(fixture));
  const factory = ({ onEvent, onTool }) => ({
    async start() {},
    async account() {
      return { connected: true };
    },
    async prompt() {
      await onTool("editor_edit", {
        operation: "clip",
        id: "graphic",
        revision: 0,
        patch: { duration: 3 },
      });
      onEvent({ type: "delta", text: "Shortened", itemId: "progress" });
      onEvent({ type: "delta", text: " the clip.", itemId: "progress" });
      onEvent({ type: "delta", text: "Ready.", itemId: "result" });
      onEvent({ type: "complete" });
    },
    async stop() {
      onEvent({ type: "complete" });
    },
    close() {},
  });
  let app;
  try {
    app = await startApp({ workspace: root, providerFactory: factory });
    await app.ready;
    const post = (route, body) =>
      fetch(app.url + "/chat/" + route, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + app.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    assert.equal((await fetch(app.url + "/chat/state")).status, 403);
    const initial = await fetch(app.url + "/chat/state", {
      headers: { Authorization: "Bearer " + app.token },
    }).then((r) => r.json());
    assert.equal(initial.mediaCount, 0);
    assert.equal(initial.clipCount, 1);
    assert.equal(
      (
        await fetch(app.url + "/chat/state", {
          headers: {
            Authorization: "Bearer " + app.token,
            Origin: "https://evil.example",
          },
        })
      ).status,
      400,
    );
    assert.equal((await post("login", { provider: "chatgpt" })).status, 200);
    assert.equal((await post("send", { text: "Shorten" })).status, 200);
    for (let i = 0; i < 40; i++) {
      const s = await fetch(app.url + "/chat/state", {
        headers: { Authorization: "Bearer " + app.token },
      }).then((r) => r.json());
      if (!s.busy) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    let state = await app.editor("/api/state");
    assert.equal(state.project.clips[0].duration, 3);
    assert.equal(state.project.clips[0].props.preserve, "yes");
    await assert.rejects(() =>
      executeTool(
        "editor_edit",
        {
          operation: "clip",
          revision: 0,
          id: "graphic",
          patch: { duration: 2 },
        },
        app.editor,
      ),
    );
    await executeTool(
      "editor_edit",
      { operation: "undo", revision: state.project.revision },
      app.editor,
    );
    state = await app.editor("/api/state");
    assert.equal(state.project.clips[0].duration, 4);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, ".editor/chat.json"))).at(-1)
        .text,
      "Shortened the clip.\n\nReady.",
    );
    await assert.rejects(() => executeTool("shell", {}, app.editor));
  } finally {
    await app?.close();
    await new Promise((r) => setTimeout(r, 150));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("video picker import preserves source quality and exposes a new render artifact", async () => {
  const { execFileSync } = await import("node:child_process");
  const root = fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "chat-video-test-",
    ),
  );
  const source = path.join(root, "original.mp4");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=160x90:rate=24",
    "-t",
    "5",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    source,
  ]);
  const original = fs.readFileSync(source);
  let app;
  try {
    app = await startApp({
      workspace: path.join(root, "project"),
      pickVideo: async () => source,
      providerFactory: () => ({
        async start() {},
        async account() {
          return { connected: false };
        },
        close() {},
      }),
    });
    await app.ready;
    const response = await fetch(app.url + "/chat/import", {
      method: "POST",
      headers: { Authorization: "Bearer " + app.token },
      body: "{}",
    });
    assert.equal(response.status, 200, await response.text());
    assert.deepEqual(fs.readFileSync(source), original);
    const state = await app.editor("/api/state");
    assert.equal(state.project.clips.length, 1);
    assert.equal(state.project.clips[0].duration, 5);
    const job = await executeTool(
      "editor_render",
      { revision: state.project.revision },
      app.editor,
    );
    let rendered;
    for (let i = 0; i < 100; i++) {
      rendered = (await app.editor("/api/state")).jobs.find(
        (j) => j.id === job.id,
      );
      if (rendered?.artifact) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(rendered.artifact, JSON.stringify(rendered));
    const artifact = await fetch(app.url + "/chat/artifact?id=" + job.id, {
      headers: { Authorization: "Bearer " + app.token },
    });
    assert.equal(artifact.status, 200);
    assert.ok((await artifact.arrayBuffer()).byteLength > 100);
  } finally {
    await app?.close();
    await new Promise((r) => setTimeout(r, 150));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
