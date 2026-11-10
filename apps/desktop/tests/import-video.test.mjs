import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { importVideo } from "../src/import-video.mjs";
import { startApp } from "../src/server.mjs";

test("4K imports preserve resolution, selected aliases and a portable original", async () => {
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-import-check-"),
  );
  try {
    const source = path.join(root, "opaque-storage-name.mov");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=s=2160x3840:r=30:d=0.1",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      source,
    ]);
    const alias = path.join(root, "My recording.MOV");
    fs.symlinkSync(source, alias);
    const app = await startApp({ workspace: path.join(root, "project") });
    const workspace = path.join(root, "project");
    try {
      await importVideo({ workspace, source: alias, editor: app.editor });
      const project = (await app.editor("/api/context")).project;
      assert.equal(project.width, 2160);
      assert.equal(project.height, 3840);
      assert.equal(project.clips[0].name, "My recording.MOV");
      const asset = project.assets[0];
      assert.equal(asset.name, "My recording.MOV");
      assert.deepEqual(
        fs.readFileSync(path.join(workspace, asset.provenance.originalFile)),
        fs.readFileSync(source),
      );
      const info = JSON.parse(
        execFileSync("ffprobe", [
          "-v",
          "error",
          "-show_streams",
          "-of",
          "json",
          path.join(workspace, asset.path),
        ]),
      );
      assert.equal(info.streams[0].height, 3840);
      await assert.rejects(
        importVideo({
          workspace,
          source: alias,
          editor: async () => ({
            project: { ...project, revision: Math.random() },
          }),
        }),
        /changed during import/,
      );
      assert.equal(
        fs.readdirSync(path.join(workspace, "media/originals")).length,
        1,
      );
    } finally {
      await app.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
