import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { RuntimeManager, releaseFor } from "../src/runtime-manager.mjs";
import { startApp } from "../src/server.mjs";
const folder = () =>
  fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "cmrx-onboarding-test-",
    ),
  );
const checksum = (data) => createHash("sha256").update(data).digest("hex");
test("managed engine verifies downloads, repairs corruption, reuses cache and rejects tampering", async () => {
  const root = folder(),
    data = Buffer.from("#!/bin/sh\nexit 0\n");
  let requests = 0,
    corrupt = false;
  const manager = new RuntimeManager({
    root,
    resolveRelease: () => ({
      version: "test",
      checksum: checksum(data),
      url: "https://fixture.invalid/engine",
    }),
    fetchImpl: async () => {
      requests++;
      return new Response(corrupt ? "tampered" : data);
    },
  });
  try {
    const phases = [];
    const binary = await manager.prepare("chatgpt", (p) =>
      phases.push(p.phase),
    );
    assert.equal(fs.readFileSync(binary, "utf8"), data.toString());
    assert.equal(fs.statSync(binary).mode & 0o777, 0o700);
    assert(phases.includes("verifying"));
    assert.equal(await manager.prepare("chatgpt"), binary);
    assert.equal(requests, 1);
    fs.writeFileSync(binary, "corruption");
    await manager.prepare("chatgpt");
    assert.equal(requests, 2);
    fs.rmSync(binary);
    corrupt = true;
    await assert.rejects(manager.prepare("chatgpt"), /verification/);
    assert.equal(fs.existsSync(binary), false);
    assert.equal(
      fs.readdirSync(path.dirname(binary)).some((p) => p.endsWith(".download")),
      false,
    );
    assert.throws(
      () => releaseFor("chatgpt", "x64", "win32"),
      /supports macOS and Linux/,
    );
  } finally {
    manager.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("managed preparation cancels and can retry without a partial executable", async () => {
  const root = folder();
  let entered;
  const waiting = new Promise((r) => (entered = r));
  const manager = new RuntimeManager({
    root,
    resolveRelease: () => ({
      version: "test",
      checksum: "0".repeat(64),
      url: "https://fixture.invalid/engine",
    }),
    fetchImpl: async (url, { signal }) => {
      entered();
      await new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    },
  });
  try {
    const preparing = manager.prepare("claude");
    await waiting;
    manager.cancel("claude");
    await assert.rejects(preparing, /canceled/);
    assert.equal(manager.tasks.size, 0);
  } finally {
    manager.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("startup and Settings never probe or inherit a signed-in runtime; explicit Connect activates, restart disconnects", async () => {
  const root = folder();
  let starts = 0,
    logins = 0,
    app;
  const providerFactory = () => ({
    async start() {
      starts++;
    },
    async account() {
      return { connected: true };
    },
    async login() {
      logins++;
    },
    close() {},
  });
  const post = (route, body = {}) =>
    fetch(app.url + "/chat/" + route, {
      method: "POST",
      headers: { Authorization: "Bearer " + app.token },
      body: JSON.stringify(body),
    });
  try {
    app = await startApp({ workspace: root, providerFactory });
    await app.ready;
    const settings = await (await post("settings")).json();
    assert(settings.providers.every((p) => !p.connected));
    assert.equal(starts, 0);
    assert.equal(
      (await post("send", { text: "Must not start a hidden runtime" })).status,
      400,
    );
    assert.equal(
      (await post("refresh-provider", { provider: "chatgpt" })).status,
      400,
    );
    assert.equal(starts, 0);
    const connected = await (
      await post("login", { provider: "chatgpt" })
    ).json();
    assert.equal(connected.providers[0].connected, true);
    assert.equal(starts, 1);
    assert.equal(logins, 0);
    await app.close();
    app = await startApp({ workspace: root, providerFactory });
    await app.ready;
    assert(
      (await (await post("settings")).json()).providers.every(
        (p) => !p.connected,
      ),
    );
    assert.equal(starts, 1);
  } finally {
    await app?.close();
    await new Promise((r) => setTimeout(r, 150));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("Connect can recover after engine startup failed", async () => {
  const { ProviderManager } = await import("../src/provider-manager.mjs");
  const root = folder();
  fs.mkdirSync(path.join(root, ".editor"));
  let starts = 0;
  const manager = new ProviderManager({
    workspace: root,
    onEvent() {},
    onTool() {},
    onChange() {},
    factory: () => ({
      async start() {
        if (++starts === 1) throw Error("Temporary failure");
      },
      async account() {
        return { connected: true };
      },
      close() {},
    }),
  });
  try {
    await assert.rejects(manager.login("chatgpt"), /Temporary failure/);
    await manager.login("chatgpt");
    assert.equal(starts, 2);
    assert.equal(manager.entries.get("chatgpt").connected, true);
  } finally {
    manager.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cached main engine still installs and verifies the required code-mode companion", async () => {
  const root = folder(),
    main = Buffer.from("main engine"),
    helper = Buffer.from("code mode host");
  const { gzipSync } = await import("node:zlib");
  const header = Buffer.alloc(512);
  header.write("codex-code-mode-host-fixture");
  header.write(helper.length.toString(8).padStart(11, "0"), 124);
  header[156] = 48;
  const archive = gzipSync(
    Buffer.concat([
      header,
      helper,
      Buffer.alloc(512 - helper.length),
      Buffer.alloc(1024),
    ]),
  );
  const counts = { main: 0, helper: 0 };
  let broken = false;
  const manager = new RuntimeManager({
    root,
    resolveRelease: () => ({
      version: "fixture",
      checksum: checksum(main),
      url: "https://fixture/main",
      companions: [
        {
          name: "codex-code-mode-host",
          member: "codex-code-mode-host-fixture",
          archive: true,
          checksum: checksum(archive),
          url: "https://fixture/helper",
        },
      ],
    }),
    fetchImpl: async (url) => {
      const key = url.split("/").at(-1);
      counts[key]++;
      return new Response(key === "main" ? main : broken ? "corrupt" : archive);
    },
  });
  try {
    const binary = await manager.prepare("chatgpt");
    const companion = path.join(path.dirname(binary), "codex-code-mode-host");
    assert.equal(fs.readFileSync(companion, "utf8"), helper.toString());
    assert.equal(fs.statSync(companion).mode & 0o777, 0o700);
    await manager.prepare("chatgpt");
    assert.deepEqual(counts, { main: 1, helper: 1 });
    fs.rmSync(companion);
    await manager.prepare("chatgpt");
    assert.deepEqual(counts, { main: 1, helper: 2 });
    fs.writeFileSync(companion, "tampered");
    await manager.prepare("chatgpt");
    assert.deepEqual(counts, { main: 1, helper: 3 });
    fs.rmSync(companion);
    broken = true;
    await assert.rejects(manager.prepare("chatgpt"), /verification/);
    assert.equal(fs.existsSync(companion), false);
    assert.equal(fs.existsSync(binary), true);
  } finally {
    manager.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
