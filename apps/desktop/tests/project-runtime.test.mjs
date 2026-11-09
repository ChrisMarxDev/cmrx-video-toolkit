import test from "node:test";
import assert from "node:assert/strict";
import {
  projectRuntime,
  timelineOwner,
  renderStage,
} from "../src/project-runtime.mjs";
test("timeline ownership preserves every legacy locking combination", () => {
  const keys = [
    "busy",
    "switching",
    "importing",
    "steering",
    "preparingRender",
    "blockingRender",
  ];
  for (let mask = 0; mask < 64; mask++) {
    const flags = Object.fromEntries(
      keys.map((key, n) => [key, !!(mask & (1 << n))]),
    );
    assert.equal(!!timelineOwner(flags), Object.values(flags).some(Boolean));
  }
});
test("graphics rendering is independent of agent ownership and temporary view controls", () => {
  const state = projectRuntime({
    jobs: [
      {
        id: "alpha",
        kind: "overlay",
        status: "running",
        phase: "capturing",
        track: 1,
        trackCount: 3,
      },
    ],
  });
  assert.equal(state.owner, null);
  assert.equal(state.agent.phase, "idle");
  assert.equal(state.preview.phase, "capturing");
  assert.equal(state.capabilities.editTimeline.allowed, true);
  assert.equal(state.capabilities.export.allowed, false);
  assert.match(state.label, /graphics preview · layer 2\/3/);
  assert(
    state.capabilities.seek.allowed && state.capabilities.previewLayers.allowed,
  );
});
test("export and preparation reserve ownership, including older jobs without phase fields", () => {
  const state = projectRuntime({
    jobs: [
      { id: "out", kind: "export", status: "running", waitingForRender: true },
    ],
  });
  assert.equal(state.owner, "export");
  assert.match(state.label, /Waiting to render video export/);
  assert.equal(state.capabilities.editTimeline.reason, "export");
  assert.equal(projectRuntime({ preparingRender: true }).owner, "export");
  assert.equal(
    renderStage({ status: "running", cancelRequested: true }),
    "canceling",
  );
});
test("agent, approval, steering and queues expose distinct observable states", () => {
  let state = projectRuntime({
    busy: true,
    connected: true,
    canSteer: true,
    queue: [{}],
    approvals: [{}],
  });
  assert.equal(state.agent.phase, "awaiting-approval");
  assert.equal(state.label, "Waiting for your approval");
  assert.equal(state.queue.phase, "waiting");
  assert.equal(state.capabilities.steerQueued.allowed, true);
  state = projectRuntime({
    busy: true,
    connected: true,
    canSteer: true,
    steering: true,
  });
  assert.equal(state.agent.phase, "steering");
  assert.equal(state.capabilities.steerQueued.reason, "steering");
  assert.equal(
    projectRuntime({ queue: [{}], queuePaused: true }).queue.phase,
    "paused",
  );
  assert.equal(projectRuntime({ queue: [{}] }).queue.phase, "disconnected");
  assert.equal(
    projectRuntime({ connected: true, queue: [{}] }).queue.phase,
    "ready",
  );
});
test("preview terminal/freshness states cannot look like ongoing rendering", () => {
  for (const status of ["failed", "canceled", "interrupted"]) {
    const state = projectRuntime({ jobs: [{ kind: "overlay", status }] });
    assert.equal(state.preview.phase, status);
    assert(!state.label.includes("Rendering"));
    assert.equal(state.capabilities.editTimeline.allowed, true);
  }
  assert.equal(
    projectRuntime({ overlay: { stale: true } }).preview.phase,
    "stale",
  );
  assert.equal(
    projectRuntime({ sourceError: "bad source" }).preview.reason,
    "source-error",
  );
  assert.equal(projectRuntime({ connected: false }).label, "Ready to edit");
});

test("service snapshots and agent context agree on runtime ownership without blocking context reads", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { startApp } = await import("../src/server.mjs");
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-runtime-contract-"),
  );
  let app, context;
  try {
    app = await startApp({
      workspace: root,
      providerFactory: () => ({
        async start() {},
        async account() {
          return { connected: true };
        },
        async models() {
          return [{ id: "test", name: "Test" }];
        },
        async prompt(_text, value) {
          context = value;
        },
        close() {},
      }),
    });
    const headers = { Authorization: "Bearer " + app.token };
    const post = (route, body) =>
      fetch(app.url + "/chat/" + route, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    await post("login", { provider: "chatgpt" });
    await post("send", { text: "Inspect the project" });
    assert.equal(context.runtime.owner, "agent");
    const state = await (
      await fetch(app.url + "/chat/state", { headers })
    ).json();
    assert.equal(state.runtime.owner, "agent");
    assert.equal(
      state.locked,
      !state.runtime.capabilities.editTimeline.allowed,
    );
    assert.equal(state.runtime.preview.phase, "ready");
    assert.equal(
      state.runtime.capabilities.steerQueued.reason,
      "provider-unsupported",
    );
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
