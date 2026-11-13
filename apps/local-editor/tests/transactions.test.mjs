import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Workspace } from "../dist/workspace.mjs";
import { loadExtensions } from "../dist/extensions.mjs";
import {
  describeInputs,
  captureFiles,
  inputFingerprint,
  createRenderJob,
  requestCancellation,
  jobProjection,
  publicRenderJob,
} from "../dist/render-contract.mjs";
const folder = () =>
  fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "cmrx-transactions-",
    ),
  );
const project = () => ({
  schemaVersion: 1,
  revision: 0,
  name: "Test",
  width: 640,
  height: 360,
  fps: 30,
  assets: [],
  clips: [],
});
test("atomic operations roll back on failure, commit once, undo together and deduplicate across restarts", () => {
  const root = folder();
  let w;
  try {
    fs.writeFileSync(
      path.join(root, "project.json"),
      JSON.stringify(project()),
    );
    w = new Workspace(root);
    const ops = [
      {
        type: "add-graphics",
        id: "first",
        source: "lib/first.dart",
        duration: 3,
      },
      {
        type: "add-graphics",
        id: "second",
        source: "lib/second.dart",
        duration: 4,
        track: 1,
      },
    ];
    assert.throws(() =>
      w.transact(0, [
        ...ops,
        { type: "clip", id: "missing", patch: { duration: 1 } },
      ]),
    );
    assert.equal(w.project.revision, 0);
    assert.equal(w.state.history.length, 1);
    assert.equal(w.project.clips.length, 0);
    const result = w.transact(0, ops, {
      operationId: "batch-1",
      actor: "agent",
      label: "Two layers",
    });
    assert.equal(result.project.revision, 1);
    assert.equal(result.receipt.baseRevision, 0);
    assert.equal(result.receipt.actor, "agent");
    assert.equal(w.state.history.length, 2);
    w.close();
    w = new Workspace(root);
    assert.equal(
      w.transact(0, ops, {
        operationId: "batch-1",
        actor: "agent",
        label: "Two layers",
      }).replayed,
      true,
    );
    assert.equal(w.project.revision, 1);
    assert.throws(
      () => w.transact(0, ops, { operationId: "batch-1", actor: "ui" }),
      (e) => e.details.code === "operation_id_conflict",
    );
    assert.throws(
      () => w.transact(0, ops),
      (e) => e.status === 409 && e.details.currentRevision === 1,
    );
    w.travel(1, -1);
    assert.equal(w.project.clips.length, 0);
    w.travel(2, 1);
    assert.equal(w.project.clips.length, 2);
  } finally {
    w?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("captured manifest freezes media, tracks content/engine changes and rejects symlinks", () => {
  const root = folder(),
    dest = folder();
  try {
    fs.mkdirSync(path.join(root, "media"));
    fs.writeFileSync(path.join(root, "media/raw.mp4"), "source");
    const p = { ...project(), assets: [{ path: "media/raw.mp4" }] };
    captureFiles(root, dest, ["media/raw.mp4"]);
    const manifest = describeInputs(dest, p, [], { id: "test", version: 1 }),
      hash = inputFingerprint(manifest);
    fs.writeFileSync(path.join(root, "media/raw.mp4"), "changed");
    assert.equal(
      fs.readFileSync(path.join(dest, "media/raw.mp4"), "utf8"),
      "source",
    );
    assert.notEqual(
      inputFingerprint(describeInputs(root, p, [], { id: "test", version: 1 })),
      hash,
    );
    assert.notEqual(
      inputFingerprint({ ...manifest, engine: { id: "test", version: 2 } }),
      hash,
    );
    const job = createRenderJob({
      revision: 0,
      engine: manifest.engine,
      inputManifest: manifest,
    });
    requestCancellation(job);
    assert.equal(jobProjection(job).phase, "canceling");
    assert.equal(job.inputManifest.files[0].sha256, manifest.files[0].sha256);
    fs.symlinkSync(
      path.join(root, "media/raw.mp4"),
      path.join(root, "media/link.mp4"),
    );
    assert.throws(() => captureFiles(root, dest, ["media/link.mp4"]));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(dest, { recursive: true, force: true });
  }
});
test("extension capabilities reject kind/command collisions and unsupported versions before loading", async () => {
  const root = folder();
  try {
    const add = (id, kind, command, capabilities) => {
      const dir = path.join(root, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "worker.mjs"),
        "export const boxes=()=>[];export const command=p=>p;",
      );
      fs.writeFileSync(
        path.join(dir, "extension.json"),
        JSON.stringify({
          apiVersion: 1,
          id,
          kind,
          name: id,
          worker: "worker.mjs",
          commands: [{ id: command, label: command }],
          capabilities,
        }),
      );
    };
    add("one", "card", "add-card", { render: 1, commands: 1 });
    assert.equal((await loadExtensions([root])).length, 1);
    add("two", "card", "other", { render: 1, commands: 1 });
    await assert.rejects(() => loadExtensions([root]), /ownership/);
    add("two", "different", "add-card", { render: 1, commands: 1 });
    await assert.rejects(() => loadExtensions([root]), /command/);
    add("two", "different", "other", { render: 2 });
    await assert.rejects(() => loadExtensions([root]), /capabilities/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("undo retries do not travel twice and rejected history validation preserves cursor", () => {
  const root = folder();
  let w;
  try {
    fs.writeFileSync(
      path.join(root, "project.json"),
      JSON.stringify(project()),
    );
    let reject = false;
    w = new Workspace(root, {
      validate: () => {
        if (reject) throw Error("Extension rejected history");
      },
    });
    w.transact(0, [
      { type: "add-graphics", source: "lib/a.dart", duration: 2 },
    ]);
    reject = true;
    assert.throws(() => w.travel(1, -1), /rejected history/);
    assert.equal(w.state.cursor, 1);
    assert.equal(w.project.revision, 1);
    reject = false;
    w.travel(1, -1, { operationId: "undo-safe", actor: "ui" });
    w.travel(1, -1, { operationId: "undo-safe", actor: "ui" });
    assert.equal(w.project.revision, 2);
  } finally {
    w?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("terminal jobs cannot project stale working phases and public receipts stay bounded", () => {
  const job = {
    id: "job",
    revision: 1,
    status: "cancelled",
    phase: "canceling",
    engine: { id: "ffmpeg", version: "test", templates: ["large"] },
    inputManifest: {
      schemaVersion: 1,
      files: [{ path: "media/source.mp4" }],
      document: { large: "not for SSE" },
    },
    fingerprint: "hash",
  };
  assert.equal(jobProjection(job).status, "canceled");
  assert.equal(jobProjection(job).phase, "canceled");
  assert.equal(jobProjection(job).engine.templates, undefined);
  assert.deepEqual(publicRenderJob(publicRenderJob(job)),publicRenderJob(job));
});
