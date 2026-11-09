import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startApp } from "../src/server.mjs";
test("graphics filmstrips require auth, select one layer and reject paths and symlinks", async () => {
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-filmstrip-auth-"),
  );
  let app;
  try {
    app = await startApp({
      workspace: root,
      autoPreview: false,
      providerFactory: () => ({ async start() {}, close() {} }),
    });
    const id = "fixture",
      dir = path.join(root, ".editor/playground", id);
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, "overlay.webm"),
      Buffer.from([26, 69, 223, 163]),
    );
    fs.writeFileSync(
      path.join(dir, "graphics-thumbnails.json"),
      JSON.stringify({
        paper: {
          count: 4,
          columns: 12,
          interval: 2.5,
          offset: 0,
          sourceStart: 2,
          errors: [],
        },
        badge: {
          count: 4,
          columns: 12,
          interval: 2.5,
          offset: 4,
          sourceStart: 0,
          errors: [],
        },
      }),
    );
    fs.writeFileSync(
      path.join(dir, "graphics-thumbnails.png"),
      Buffer.from([137, 80, 78, 71]),
    );
    app.playground.jobs.push({
      id,
      status: "complete",
      overlay: true,
      thumbnails: true,
      previewTracks: [1, 2],
    });
    const route = "/chat/graphics-preview?id=fixture&clip=badge";
    assert.equal((await fetch(app.url + route)).status, 403);
    const headers = { Authorization: "Bearer " + app.token };
    fs.writeFileSync(path.join(dir, "overlay_track_1.webm"), "red-layer");
    fs.writeFileSync(path.join(dir, "overlay_track_2.webm"), "blue-layer");
    const layer = app.url + "/chat/overlay?id=fixture&track=2";
    assert.equal((await fetch(layer)).status, 403);
    assert.equal(await (await fetch(layer, { headers })).text(), "blue-layer");
    const range = await fetch(layer, {
      headers: { ...headers, Range: "bytes=0-3" },
    });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), "blue");
    for (const track of ["99", "../outside", "-1", "1.5"])
      assert.equal(
        (
          await fetch(
            app.url +
              "/chat/overlay?id=fixture&track=" +
              encodeURIComponent(track),
            { headers },
          )
        ).status,
        400,
      );
    fs.unlinkSync(path.join(dir, "overlay_track_2.webm"));
    fs.symlinkSync(
      path.join(root, "project.json"),
      path.join(dir, "overlay_track_2.webm"),
    );
    assert.equal((await fetch(layer, { headers })).status, 400);
    const selected = await fetch(app.url + route, { headers }).then((r) =>
      r.json(),
    );
    assert.equal(selected.offset, 4);
    assert.equal(selected.count, 4);
    assert(selected.sprite.startsWith("/chat/graphics-sprite?"));
    for (const suffix of [
      "id=../outside&clip=badge",
      "id=fixture&clip=__proto__",
      "id=fixture&clip=missing",
    ])
      assert.equal(
        (await fetch(app.url + "/chat/graphics-preview?" + suffix, { headers }))
          .status,
        400,
      );
    assert.equal((await fetch(app.url + selected.sprite)).status, 200);
    fs.unlinkSync(path.join(dir, "graphics-thumbnails.png"));
    fs.symlinkSync(
      path.join(root, "project.json"),
      path.join(dir, "graphics-thumbnails.png"),
    );
    assert.equal((await fetch(app.url + selected.sprite)).status, 400);
    fs.renameSync(dir, dir + "-moved");
    fs.symlinkSync(dir + "-moved", dir, "dir");
    assert.equal((await fetch(app.url + route, { headers })).status, 400);
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
