import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startApp } from "../src/server.mjs";
const waitFor = async (read, predicate) => {
  for (let i = 0; i < 120; i++) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw Error("Queue did not reach expected state");
};
test("messages queue FIFO without parallel turns; comments, cancel, stop, restart and errors preserve waiting work", async () => {
  const workspace = fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "cmrx-queue-test-",
    ),
  );
  let app, emit;
  const calls = [];
  const factory = ({ onEvent }) => {
    emit = onEvent;
    return {
      async start() {},
      async account() {
        return { connected: true };
      },
      async models() {
        return [{ id: "test", name: "Test", isDefault: true }];
      },
      async prompt(text, context) {
        calls.push({ text, context });
      },
      async stop() {
        await onEvent({ type: "complete" });
      },
      close() {},
    };
  };
  const post = (route, body = {}) =>
    fetch(app.url + "/chat/" + route, {
      method: "POST",
      headers: { Authorization: "Bearer " + app.token },
      body: JSON.stringify(body),
    });
  const state = () =>
    fetch(app.url + "/chat/state", {
      headers: { Authorization: "Bearer " + app.token },
    }).then((r) => r.json());
  try {
    app = await startApp({ workspace, providerFactory: factory });
    await post("login", { provider: "chatgpt" });
    await post("send", { text: "First" });
    assert.equal(calls.length, 1);
    const second = await (await post("send", { text: "Second" })).json();
    assert.equal(second.queued, true);
    const third = await (await post("send", { text: "Remove me" })).json();
    await post("queue-remove", { id: third.id });
    assert.equal(calls.length, 1);
    await app.editor("/api/comment", {
      revision: 0,
      body: "Note for later",
      anchor: { type: "timeline", time: 0 },
    });
    const note = (await state()).pendingComments[0];
    await post("send", { text: "", comments: [note] });
    assert.deepEqual((await state()).pendingComments, []);
    await emit({ type: "complete" });
    await waitFor(state, (s) => s.messages.length === 2);
    assert.equal(calls[1].text, "Second");
    assert.equal((await state()).queue.length, 1);
    await post("stop");
    assert.equal((await state()).queuePaused, true);
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal(calls.length, 2);
    await app.close();
    app = await startApp({ workspace, providerFactory: factory });
    assert.equal((await state()).queue.length, 1);
    assert.equal((await state()).queuePaused, true);
    await post("login", { provider: "chatgpt" });
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal(calls.length, 2);
    await post("queue-resume");
    await waitFor(state, (s) => s.messages.length === 3);
    assert.deepEqual(calls[2].context.attachedComments, [note]);
    const queued = await (await post("send", { text: "After failure" })).json();
    await emit({ type: "complete", error: "Fixture failure" });
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal(calls.length, 3);
    assert.equal((await state()).queuePaused, true);
    await post("queue-remove", { id: queued.id });
    assert.equal((await state()).queue.length, 0);
  } finally {
    await app?.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("a changed queued note pauses execution instead of silently using stale feedback", async () => {
  const workspace = fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "cmrx-queue-stale-",
    ),
  );
  let app, emit;
  let prompts = 0;
  try {
    app = await startApp({
      workspace,
      providerFactory: ({ onEvent }) => {
        emit = onEvent;
        return {
          async start() {},
          async account() {
            return { connected: true };
          },
          async prompt() {
            prompts++;
          },
          close() {},
        };
      },
    });
    const post = (route, body = {}) =>
      fetch(app.url + "/chat/" + route, {
        method: "POST",
        headers: { Authorization: "Bearer " + app.token },
        body: JSON.stringify(body),
      });
    const state = () =>
      fetch(app.url + "/chat/state", {
        headers: { Authorization: "Bearer " + app.token },
      }).then((r) => r.json());
    await post("login", { provider: "chatgpt" });
    await post("send", { text: "First" });
    await app.editor("/api/comment", {
      revision: 0,
      body: "Old note",
      anchor: { type: "timeline", time: 0 },
    });
    await post("send", { text: "", comments: (await state()).pendingComments });
    const note = (await app.editor("/api/context")).project.comments[0];
    await app.editor("/api/comment-update", {
      revision: 1,
      id: note.id,
      patch: { body: "Changed note" },
    });
    await emit({ type: "complete" });
    const paused = await waitFor(state, (s) => s.queuePaused);
    assert.match(paused.error, /comment changed/);
    assert.equal(paused.queue.length, 1);
    assert.equal(prompts, 1);
  } finally {
    await app?.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("a message sent during rendering waits without canceling that render", async () => {
  const workspace = fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "cmrx-queue-render-",
    ),
  );
  let app,
    prompts = 0;
  try {
    app = await startApp({
      workspace,
      providerFactory: () => ({
        async start() {},
        async account() {
          return { connected: true };
        },
        async prompt() {
          prompts++;
        },
        close() {},
      }),
    });
    const post = (route, body = {}) =>
      fetch(app.url + "/chat/" + route, {
        method: "POST",
        headers: { Authorization: "Bearer " + app.token },
        body: JSON.stringify(body),
      });
    const state = () =>
      fetch(app.url + "/chat/state", {
        headers: { Authorization: "Bearer " + app.token },
      }).then((r) => r.json());
    await post("login", { provider: "chatgpt" });
    const job = { id: "existing-render", kind: "export", status: "running" };
    app.playground.jobs.push(job);
    assert.equal((await post("send", { text: "After render" })).status, 200);
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal(prompts, 0);
    assert.equal(job.status, "running");
    job.status = "complete";
    await waitFor(state, () => prompts === 1);
    assert.equal(prompts, 1);
    assert.equal((await state()).queue.length, 0);
  } finally {
    await app?.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("immediate messages steer one active turn, retain payloads, preserve queued work and recover on rejection", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-steer-test-"),
  );
  let app,
    client,
    emit,
    rejectSteer = false,
    completeSteer,
    holdSteer = false;
  const calls = [],
    steering = [];
  const post = (route, body = {}) =>
    fetch(app.url + "/chat/" + route, {
      method: "POST",
      headers: { Authorization: "Bearer " + app.token },
      body: JSON.stringify(body),
    });
  const state = () =>
    fetch(app.url + "/chat/state", {
      headers: { Authorization: "Bearer " + app.token },
    }).then((r) => r.json());
  try {
    app = await startApp({
      workspace,
      providerFactory: ({ onEvent }) => {
        emit = onEvent;
        return (client = {
          async start() {},
          async account() {
            return { connected: true };
          },
          async models() {
            return [{ id: "test", name: "Test", isDefault: true }];
          },
          async prompt(text, context) {
            calls.push({ text, context });
          },
          async steer(text, context) {
            if (rejectSteer) throw Error("Active turn finished");
            steering.push({ text, context });
            if (holdSteer)
              await new Promise((resolve) => {
                completeSteer = resolve;
              });
          },
          async stop() {
            await emit({ type: "complete" });
          },
          close() {},
        });
      },
    });
    await post("login", { provider: "chatgpt" });
    const imported = await (
      await fetch(app.url + "/chat/asset-import", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + app.token,
          "X-File-Name": "reference.txt",
        },
        body: "Reference for this correction",
      })
    ).json();
    const asset = {
      scope: "project",
      path: imported.path.slice("assets/".length),
    };
    await post("send", { text: "Build a video" });
    await emit({ type: "delta", text: "Starting", itemId: "before" });
    await post("send", { text: "Later task" });
    await app.editor("/api/comment", {
      revision: 0,
      body: "Use blue",
      anchor: { type: "timeline", time: 0 },
    });
    const note = (await state()).pendingComments[0];
    const result = await (
      await post("send", {
        text: "Actually blue",
        assets: [asset],
        comments: [note],
        delivery: "now",
      })
    ).json();
    assert.equal(result.steered, true);
    assert.equal(calls.length, 1);
    assert.equal(steering.length, 1);
    assert.equal(
      steering[0].context.attachedAssets[0].workspacePath,
      imported.path,
    );
    assert.deepEqual(steering[0].context.attachedComments, [note]);
    assert.equal(
      JSON.stringify(steering[0].context).includes("Later task"),
      false,
    );
    assert.equal((await state()).queue.length, 1);
    assert.equal((await state()).busy, true);
    assert.deepEqual((await state()).pendingComments, []);
    await emit({ type: "delta", text: "Using blue", itemId: "after" });
    assert.deepEqual(
      (await state()).messages.map((m) => m.text),
      ["Build a video", "Starting", "Actually blue", "Using blue"],
    );
    rejectSteer = true;
    assert.equal(
      (await post("send", { text: "Failed delivery", delivery: "now" })).status,
      400,
    );
    assert(!(await state()).messages.some((m) => m.text === "Failed delivery"));
    assert.equal((await state()).busy, true);
    rejectSteer = false;
    holdSteer = true;
    const held = post("send", { text: "Held correction", delivery: "now" });
    await waitFor(async () => !!completeSteer, Boolean);
    assert.equal(
      (await post("send", { text: "Duplicate", delivery: "now" })).status,
      400,
    );
    await emit({ type: "complete" });
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal(calls.length, 1); // Queue must not race an unacknowledged steering request.
    completeSteer();
    assert.equal((await held).status, 200);
    await waitFor(state, (s) => s.queue.length === 0);
    assert.equal(calls[1].text, "Later task");
    await post("send", { text: "Still waiting" });
    await post("stop");
    const direct = await (
      await post("send", { text: "Do this first", delivery: "now" })
    ).json();
    assert.equal(direct.queued, undefined);
    assert.equal(calls.at(-1).text, "Do this first");
    assert.equal((await state()).queue[0].text, "Still waiting");
    assert.equal((await state()).queuePaused, true);
    delete client.steer;
    assert.equal(
      (await post("send", { text: "Unsupported", delivery: "now" })).status,
      400,
    );
    assert.equal((await state()).queue.length, 1);
    assert.equal((await state()).canSteer, false);
  } finally {
    completeSteer?.();
    await app?.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("Codex steering uses the active turn precondition and never starts a second turn", async () => {
  const { CodexProvider } = await import("../src/codex.mjs");
  const provider = Object.create(CodexProvider.prototype);
  provider.thread = "thread";
  provider.turn = "turn";
  const calls = [];
  provider.call = async (method, params) => {
    calls.push({ method, params });
    return { turnId: "turn" };
  };
  await provider.steer("Use blue", { attachedComments: [] });
  assert.equal(calls[0].method, "turn/steer");
  assert.equal(calls[0].params.expectedTurnId, "turn");
  assert.equal(calls[0].params.threadId, "thread");
  assert.match(calls[0].params.input[0].text, /Use blue/);
  provider.turn = null;
  await assert.rejects(provider.steer("Too late", {}), /finished/);
  assert.equal(calls.length, 1);
});
