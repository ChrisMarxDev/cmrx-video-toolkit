import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { startApp } from "../src/server.mjs";

test("dropped assets preserve bytes, reject unauthenticated requests and reach the agent after restart", async () => {
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-drop-test-"),
  );
  let app;
  const factory = () => ({ async start() {}, close() {} });
  const put = (app, name, body, auth = true) =>
    fetch(app.url + "/chat/asset-import", {
      method: "POST",
      headers: {
        ...(auth ? { Authorization: "Bearer " + app.token } : {}),
        "X-File-Name": encodeURIComponent(name),
      },
      body,
    });
  try {
    app = await startApp({ workspace: root, providerFactory: factory });
    assert.equal((await put(app, "x.txt", "no", false)).status, 403);
    const bytes = Buffer.from([0, 1, 255, 13, 10, 123]);
    const first = await (await put(app, "../../reference.png", bytes)).json();
    assert.match(first.path, /^assets\/imports\/[^/]+-reference.png$/);
    assert.deepEqual(fs.readFileSync(path.join(root, first.path)), bytes);
    const second = await (await put(app, "reference.png", "different")).json();
    assert.notEqual(first.path, second.path);
    assert(app.playground.files().includes(first.path));
    assert.equal(app.agent.context().importedAssets.length, 2);
    await app.close();
    app = await startApp({ workspace: root, providerFactory: factory });
    assert.equal(app.agent.context().importedAssets[0].sha256, first.sha256);
    const video = path.join(root, "recording.mp4");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=purple:s=160x96:r=30:d=0.2",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-pix_fmt",
      "yuv420p",
      video,
    ]);
    const v = await (
      await put(app, "recording.mp4", fs.readFileSync(video))
    ).json();
    assert.equal(v.timeline.exactCopy, true);
    assert.equal((await app.editor("/api/context")).project.clips.length, 1);
    fs.symlinkSync(os.tmpdir(), path.join(root, "assets", "escape"));
    assert.throws(
      () => app.playground.file("assets/escape/x", true),
      /Symlinks/,
    );
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
