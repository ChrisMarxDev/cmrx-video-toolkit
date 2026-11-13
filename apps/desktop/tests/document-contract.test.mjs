import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startApp } from "../src/server.mjs";
import { executeTool } from "../src/tools.mjs";
import { Playground } from "../src/playground.mjs";
const folder = () =>
  fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-contract-"));
test("agent batches and HTTP share receipts, conflicts and one undo step", async () => {
  const root = folder();
  let app;
  try {
    app = await startApp({ workspace: root, autoPreview: false });
    const revision = (await app.editor("/api/context")).project.revision;
    const request = {
      revision,
      operationId: "two-layers",
      label: "Two layers",
      operations: [
        {
          type: "add-graphics",
          id: "one",
          source: "lib/one.dart",
          duration: 2,
        },
        {
          type: "add-graphics",
          id: "two",
          source: "lib/two.dart",
          duration: 3,
          track: 1,
        },
      ],
    };
    const result = await executeTool("editor_batch", request, app.editor);
    assert.equal(result.receipt.actor, "agent");
    assert.equal(result.project.clips.length, 2);
    assert.equal(
      (await executeTool("editor_batch", request, app.editor)).replayed,
      true,
    );
    await assert.rejects(
      () =>
        executeTool(
          "editor_batch",
          { ...request, operationId: "stale" },
          app.editor,
        ),
      (e) => e.details.code === "revision_conflict",
    );
    await app.editor("/api/undo", {
      revision: result.project.revision,
      actor: "ui",
      operationId: "undo-1",
    });
    const state = await app.editor("/api/context");
    assert.equal(state.project.clips.length, 0);
    assert.equal(state.transactions.at(-1).label, "Undo");
    assert.equal(state.transactions.at(-1).actor, "ui");
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("desktop snapshots capture media and authored sources before work starts", async () => {
  const root = folder();
  try {
    const project = {
      schemaVersion: 1,
      revision: 0,
      name: "Snapshot",
      width: 640,
      height: 360,
      fps: 30,
      assets: [
        {
          id: "video",
          name: "Raw",
          path: "media/raw.mp4",
          duration: 2,
          audio: false,
        },
      ],
      clips: [],
    };
    fs.mkdirSync(path.join(root, "media"));
    fs.writeFileSync(path.join(root, "media/raw.mp4"), "original media");
    fs.writeFileSync(path.join(root, "project.json"), JSON.stringify(project));
    const p = new Playground({ workspace: root });
    let release;
    const wait = new Promise((r) => (release = r));
    p.prepare = async () => {
      await wait;
      throw Error("Fixture stops after snapshot");
    };
    const job = await p.render(0);
    const dest = path.join(root, ".editor/playground", job.id);
    assert.equal(
      p.jobs
        .find((j) => j.id === job.id)
        .inputManifest.files.find((f) => f.path === "media/raw.mp4").bytes,
      14,
    );
    assert(fs.existsSync(path.join(dest, "input-manifest.json")));
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dest, "input-manifest.json")),
    );
    assert(manifest.generated.some((f) => f.path === "lib/composition.dart"));
    assert.equal(
      manifest.sourceCopies[0].snapshotPath,
      "authored-composition.dart",
    );
    fs.writeFileSync(path.join(root, "media/raw.mp4"), "changed source");
    p.write("lib/graphics.dart", "// changed after snapshot");
    assert.equal(
      fs.readFileSync(path.join(dest, "media/raw.mp4"), "utf8"),
      "original media",
    );
    assert.notEqual(
      fs.readFileSync(path.join(dest, "lib/graphics.dart"), "utf8"),
      "// changed after snapshot",
    );
    release();
    await p.renderTask;
    assert.equal(p.jobs.find((j) => j.id === job.id).status, "failed");
    await p.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
