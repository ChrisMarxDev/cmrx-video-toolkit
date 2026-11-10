import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SavedConnections } from "../src/saved-connections.mjs";
import { startApp } from "../src/server.mjs";
test("saved provider connections restore across app restarts; sign-out stays signed out", async () => {
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-saved-login-"),
  );
  let app;
  try {
    const profile = path.join(root, "profile"),
      workspace = path.join(root, "project");
    let enabled = new SavedConnections(profile);
    assert.equal(enabled.size, 0);
    const options = () => ({
      workspace,
      sharedEnabled: enabled,
      providerFactory: () => ({
        async start() {},
        async account() {
          return { connected: true };
        },
        async models() {
          return [];
        },
        async logout() {},
        close() {},
      }),
    });
    app = await startApp(options());
    await app.ready;
    assert.equal(app.manager.entries.get("chatgpt").connected, false);
    await app.manager.login("chatgpt");
    assert.equal(app.manager.entries.get("chatgpt").connected, true);
    await app.close();
    enabled = new SavedConnections(profile);
    app = await startApp(options());
    await app.ready;
    assert.equal(app.manager.entries.get("chatgpt").connected, true);
    await app.manager.logout("chatgpt");
    await app.close();
    enabled = new SavedConnections(profile);
    assert.equal(enabled.has("chatgpt"), false);
    app = await startApp(options());
    await app.ready;
    assert.equal(app.manager.entries.get("chatgpt").connected, false);
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("migration considers only app-owned credentials and never overrides saved sign-out", () => {
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-login-migration-"),
  );
  try {
    fs.mkdirSync(path.join(root, "accounts/codex"), { recursive: true });
    fs.writeFileSync(path.join(root, "accounts/codex/auth.json"), "{}");
    const saved = new SavedConnections(root);
    assert(saved.has("chatgpt"));
    saved.delete("chatgpt");
    assert.equal(new SavedConnections(root).size, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
