import { inspectFrame } from "../src/visual-inspection.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { startApp } from "../src/server.mjs";
import { importVideo } from "../src/import-video.mjs";
import { ProjectServices } from "../src/project-services.mjs";
import { startManualRender } from "../src/render-service.mjs";
const temp = () =>
  fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-project-services-"));
const video = (file, duration) =>
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=red:s=64x64:r=2:d=${duration}`,
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-pix_fmt",
    "yuv420p",
    file,
  ]);
test("real long source import stays asset-only, bounded multimodal source window and selected interval insertion survive reopen", async () => {
  const root = temp();
  let app;
  try {
    const file = path.join(root, "long.mp4");
    video(file, 601);
    const workspace = path.join(root, "project");
    app = await startApp({ workspace, autoPreview: false });
    const result = await importVideo({
      workspace,
      source: file,
      editor: app.editor,
    });
    assert.equal(result.assetOnly, true);
    let p = (await app.editor("/api/context")).project;
    assert.equal(p.clips.length, 0);
    assert.equal(p.assets[0].duration, 601);
    const services = new ProjectServices({
      workspace,
      editor: app.editor,
      playground: app.playground,
    });
    const source = await services.run("source-window", {
      assetId: p.assets[0].id,
      start: 590,
      duration: 10,
    });
    assert.equal(source.start, 590);
    assert.ok(source.frames.length <= 10);
    assert.ok(source.sprite.startsWith("data:image/jpeg"));
    await app.editor("/api/add", {
      revision: p.revision,
      assetId: p.assets[0].id,
      in: 595,
      duration: 4,
    });
    p = (await app.editor("/api/context")).project;
    assert.equal(p.clips[0].in, 595);
    assert.equal(p.clips[0].duration, 4);
    const frame = await inspectFrame({
      workspace,
      project: p,
      playground: app.playground,
      args: { assetId: p.assets[0].id, time: 600.5 },
    });
    assert.equal(frame.content[1].type, "image");
    const interchange = await services.run("interchange-export", {
      revision: p.revision,
    });
    const timeline = JSON.parse(
      fs.readFileSync(path.join(workspace, interchange.path, "project.otio")),
    );
    const imported = await services.run("interchange-import", {
      revision: p.revision,
      timeline,
    });
    assert.equal(imported.project.clips[0].id, p.clips[0].id);
    assert.equal(imported.project.clips[0].in, 595);
    assert.equal(imported.project.clips[0].duration, 4);
    await app.close();
    app = await startApp({ workspace, autoPreview: false });
    p = (await app.editor("/api/context")).project;
    assert.equal(p.clips[0].in, 595);
    assert.equal(p.assets[0].duration, 601);
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("authenticated project actions capture/restore code and document; OTIO/source export and registered arbitrary output use one project", async () => {
  const root = temp();
  let app;
  try {
    app = await startApp({ workspace: root, autoPreview: false });
    const post = async (body) => {
      const r = await fetch(app.url + "/chat/project-action", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + app.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      return d;
    };
    let p = (await app.editor("/api/context")).project;
    const saved = await post({
      action: "checkpoint-create",
      revision: p.revision,
      label: "Blank toolkit",
    });
    fs.writeFileSync(path.join(root, "lib/graphics.dart"), "changed");
    await app.editor("/api/add-graphics", {
      revision: p.revision,
      source: "lib/new.dart",
      duration: 2,
    });
    let d = await post({ action: "checkpoint-diff", id: saved.id });
    assert.ok(d.changed.includes("lib/graphics.dart"));
    assert.equal(d.documentChanged, true);
    await post({
      action: "checkpoint-restore",
      id: saved.id,
      revision: d.baseRevision,
    });
    p = (await app.editor("/api/context")).project;
    assert.equal(p.clips.length, 0);
    assert.notEqual(
      fs.readFileSync(path.join(root, "lib/graphics.dart"), "utf8"),
      "changed",
    );
    const interchange = await post({
      action: "interchange-export",
      revision: p.revision,
    });
    assert.ok(
      fs.existsSync(
        path.join(root, interchange.path, "sources/lib/graphics.dart"),
      ),
    );
    fs.mkdirSync(path.join(root, "assets"), { recursive: true });
    video(path.join(root, "assets/anything.mp4"), 3);
    const job = await post({
      action: "output-register",
      path: "assets/anything.mp4",
      revision: p.revision,
    });
    assert.equal(job.status, "complete");
    p = (await app.editor("/api/context")).project;
    assert.equal(p.previewMode, "rendered");
    assert.equal(p.clips.length, 0);
    assert.equal(app.playground.state().rendered.duration, 3);
    const bytes = await fetch(app.url + "/chat/artifact?id=" + job.id, {
      headers: { Authorization: "Bearer " + app.token },
    });
    assert.equal(bytes.status, 200);
    assert.ok((await bytes.arrayBuffer()).byteLength > 100);
    let actual = await startManualRender({
      runtime: () => ({ capabilities: { export: { allowed: true } } }),
      reserve: () => {},
      publish: () => {},
      activeWrites: () => 0,
      editor: app.editor,
      playground: app.playground,
    });
    assert.equal(actual.id, job.id);
    fs.writeFileSync(path.join(root, "lib/graphics.dart"), "changed again");
    assert.equal(app.playground.state().rendered.stale, true);
    await assert.rejects(
      startManualRender({
        runtime: () => ({ capabilities: { export: { allowed: true } } }),
        reserve: () => {},
        publish: () => {},
        activeWrites: () => 0,
        editor: app.editor,
        playground: app.playground,
      }),
      /outdated/,
    );
    await post({ action: "output-interactive", revision: p.revision });
    assert.equal(app.playground.state().rendered, null);
    await assert.rejects(
      post({ action: "checkpoint-create", revision: 0 }),
      /Revision/,
    );
    await app.close();
    app = await startApp({ workspace: root, autoPreview: false });
    assert.ok(
      (await post({ action: "checkpoint-list" })).checkpoints.length > 0,
    );
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("non-browser generated video is normalized for review without changing source; media/ registration and immutable receipt work", async () => {
  const root = temp();
  let app;
  try {
    app = await startApp({ workspace: root, autoPreview: false });
    const input = path.join(root, "media/generated.mov");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=green:s=64x64:r=2:d=1",
      "-c:v",
      "qtrle",
      "-threads",
      "1",
      input,
    ]);
    const before = fs.readFileSync(input),
      svc = new ProjectServices({
        workspace: root,
        editor: app.editor,
        playground: app.playground,
      }),
      job = await svc.run("output-register", {
        revision: 0,
        path: "media/generated.mov",
      });
    assert.equal(job.status, "complete");
    const p = (await app.editor("/api/context")).project;
    assert.equal(p.renderedOutput.normalized, true);
    assert.deepEqual(fs.readFileSync(input), before);
    assert.equal(app.playground.state().rendered.stale, false);
    assert.ok(
      fs.existsSync(
        path.join(app.playground.jobsDir, job.id, "input-manifest.json"),
      ),
    );
    assert.ok(
      fs.existsSync(
        path.join(app.playground.jobsDir, job.id, "lib/composition.dart"),
      ),
    );
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
