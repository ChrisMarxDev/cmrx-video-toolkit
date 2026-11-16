import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { startApp } from "../src/server.mjs";
import { importVideo } from "../src/import-video.mjs";
import { createWorkspace } from "../src/workspace-library.mjs";
import { ProjectBranches } from "../src/project-branches.mjs";
import { branchProject } from "../../../flow/project/branch.mjs";
import { validate } from "../../local-editor/dist/model.mjs";
const folder = () =>
  fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-project-branches-"));
const fixture = () => ({
  schemaVersion: 1,
  revision: 9,
  name: "Parent",
  width: 640,
  height: 360,
  fps: 30,
  assets: [
    {
      id: "a",
      name: "Recording",
      path: "media/a.mp4",
      duration: 20,
      audio: true,
    },
  ],
  clips: [
    {
      id: "v",
      kind: "video",
      name: "Footage",
      assetId: "a",
      start: 0,
      in: 10,
      duration: 4,
      track: 0,
      x: 0,
      y: 0,
      width: 640,
      height: 360,
      muted: false,
    },
    {
      id: "g",
      kind: "graphics",
      name: "Dynamic",
      start: 1,
      in: 0,
      duration: 2,
      track: 1,
      x: 0,
      y: 0,
      width: 640,
      height: 360,
      muted: false,
      props: { source: "lib/new.dart" },
    },
  ],
  comments: [
    {
      id: "note",
      body: "Review this",
      status: "open",
      createdRevision: 5,
      anchor: { type: "clip", clipId: "v", sourceAssetId: "a", sourceTime: 12 },
    },
  ],
});
test("timeline branching preserves editable layers, source clocks, relevant comments and parent immutability", () => {
  const source = fixture(),
    before = JSON.stringify(source),
    child = branchProject(source, {
      name: "Extract",
      brief: "Explain the second point",
      ranges: [{ start: 1, end: 3 }],
    }).project;
  validate(child);
  assert.equal(child.revision, 0);
  const v = child.clips.find((c) => c.kind === "video"),
    g = child.clips.find((c) => c.kind === "graphics");
  assert.equal(v.in, 11);
  assert.equal(v.start, 0);
  assert.equal(v.duration, 2);
  assert.equal(g.start, 0);
  assert.equal(g.props.source, "lib/new.dart");
  assert.equal(child.comments[0].anchor.clipId, v.id);
  assert.equal(JSON.stringify(source), before);
  const raw = branchProject(source, {
    name: "Raw cut",
    brief: "Another passage",
    ranges: [{ assetId: "a", start: 15, end: 16 }],
  }).project;
  assert.equal(raw.clips.length, 1);
  assert.equal(raw.clips[0].in, 15);
  assert.throws(() =>
    branchProject(source, { name: "../escape", brief: "No" }),
  );
  assert.throws(() =>
    branchProject(source, {
      name: "Mixed",
      brief: "No",
      ranges: [
        { start: 0, end: 1 },
        { assetId: "a", start: 1, end: 2 },
      ],
    }),
  );
});
test("batch copies full-quality media and code/context, isolates histories, replays safely, reopens and renders real cuts", async () => {
  const root = folder();
  let parent, child;
  try {
    const owner = createWorkspace(path.join(root, "workspace")),
      workspace = path.join(owner.folder, "projects/parent");
    fs.mkdirSync(workspace);
    parent = await startApp({
      workspace,
      workspaceRoot: owner.folder,
      autoPreview: false,
    });
    const input = path.join(root, "input.mp4");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=640x360:r=30:d=4,drawbox=c=blue:t=fill:enable='gte(t,2)'",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=4",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-c:a",
      "aac",
      "-pix_fmt",
      "yuv420p",
      input,
    ]);
    const imported = await importVideo({
      workspace,
      source: input,
      editor: parent.editor,
    });
    fs.writeFileSync(
      path.join(workspace, "AGENTS.md"),
      "Use concise captions.",
    );
    fs.writeFileSync(
      path.join(workspace, "script.md"),
      "Parent complete script",
    );
    parent.playground.write("lib/custom.dart", "// Arbitrary custom code");
    const before = fs.readFileSync(path.join(workspace, "project.json")),
      p = (await parent.editor("/api/context")).project,
      opened = [];
    const service = new ProjectBranches({
        workspace,
        workspaceRoot: owner.folder,
        editor: parent.editor,
        openProject: async (f) => opened.push(f),
      }),
      args = {
        revision: p.revision,
        requestId: "two-cuts",
        projects: [
          {
            name: "first",
            brief: "First idea",
            script: "Child script",
            ranges: [{ assetId: imported.assetId, start: 0, end: 1 }],
          },
          {
            name: "second",
            brief: "Second idea",
            instructions: "Focus on the demo",
            ranges: [{ assetId: imported.assetId, start: 2, end: 3 }],
          },
        ],
      };
    const receipt = await service.create(args);
    assert.equal(receipt.projects.length, 2);
    assert.equal((await service.create(args)).replayed, true);
    const reordered = {
      ...args,
      projects: args.projects.map((p) =>
        Object.fromEntries(Object.entries(p).reverse()),
      ),
    };
    assert.equal((await service.create(reordered)).replayed, true);
    const savedReceipt = path.join(
        workspace,
        ".editor/project-branches/two-cuts.json",
      ),
      pending = JSON.parse(fs.readFileSync(savedReceipt));
    pending.status = "ready";
    fs.writeFileSync(savedReceipt, JSON.stringify(pending));
    const edited = path.join(owner.folder, "projects/first/memory.md");
    fs.writeFileSync(edited, "User work after creation");
    assert.equal((await service.create(args)).replayed, true);
    assert.equal(fs.readFileSync(edited, "utf8"), "User work after creation");
    assert.deepEqual(
      fs.readFileSync(path.join(workspace, "project.json")),
      before,
    );
    const target = path.join(owner.folder, "projects/second");
    assert.equal(
      fs.readFileSync(path.join(target, "lib/custom.dart"), "utf8"),
      "// Arbitrary custom code",
    );
    assert.match(
      fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"),
      /Focus on the demo/,
    );
    assert.equal(
      fs.readFileSync(path.join(target, "context/workspace-AGENTS.md"), "utf8"),
      fs.readFileSync(path.join(owner.folder, "AGENTS.md"), "utf8"),
    );
    assert.equal(
      fs.readFileSync(path.join(target, "context/parent-script.md"), "utf8"),
      "Parent complete script",
    );
    assert.equal(fs.existsSync(path.join(target, ".editor/chat.json")), false);
    assert.equal(
      fs.readFileSync(
        path.join(owner.folder, "projects/first/script.md"),
        "utf8",
      ),
      "Child script",
    );
    assert.notEqual(
      fs.statSync(path.join(workspace, p.assets[0].path)).ino,
      fs.statSync(path.join(target, p.assets[0].path)).ino,
    );
    assert.deepEqual(
      fs.readFileSync(path.join(workspace, p.assets[0].path)),
      fs.readFileSync(path.join(target, p.assets[0].path)),
    );
    assert.ok(service.list().projects.some((p) => p.name === "second"));
    await service.open("second");
    assert.equal(opened[0], target);
    await assert.rejects(service.open("../parent"), /existing/);
    await assert.rejects(
      service.create({
        ...args,
        projects: [{ name: "third", brief: "Different" }],
      }),
      /different input/,
    );
    await assert.rejects(
      service.create({ ...args, requestId: "stale", revision: 0 }),
      /Revision/,
    );
    await assert.rejects(
      service.create({ ...args, requestId: "duplicate" }),
      /already exists/,
    );
    await assert.rejects(
      service.create({
        ...args,
        requestId: "invalid-batch",
        projects: [
          { name: "not-published", brief: "Fine" },
          {
            name: "bad",
            brief: "Bad",
            ranges: [{ assetId: "missing", start: 0, end: 1 }],
          },
        ],
      }),
    );
    assert.equal(
      fs.existsSync(path.join(owner.folder, "projects/not-published")),
      false,
    );
    child = await startApp({
      workspace: target,
      workspaceRoot: owner.folder,
      autoPreview: false,
    });
    const context = await child.editor("/api/context");
    assert.equal(context.project.clips[0].in, 2);
    assert.equal(context.project.clips[0].duration, 1);
    assert.ok(child.playground.files().includes("context/source-project.json"));
    const job = await child.editor("/api/render", { revision: 0 });
    let done;
    for (let i = 0; i < 100; i++) {
      done = (await child.editor("/api/state")).jobs.find(
        (j) => j.id === job.id,
      );
      if (done.status !== "running") break;
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.equal(done.status, "complete", done.error);
    const artifact = path.join(target, ".editor/jobs", job.id + ".mp4");
    const media = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_format",
          "-show_streams",
          "-of",
          "json",
          artifact,
        ],
        { encoding: "utf8" },
      ),
    );
    assert.ok(Math.abs(Number(media.format.duration) - 1) < 0.07);
    assert.ok(media.streams.some((s) => s.codec_type === "audio"));
    const pixels = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        artifact,
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "pipe:1",
      ],
      { maxBuffer: 1024 * 1024 },
    );
    const center = (180 * 640 + 320) * 3;
    assert.ok(
      pixels[center + 2] > 200 && pixels[center] < 40,
      "Child must begin with the selected blue source passage",
    );
    await child.close();
    child = null;
    fs.writeFileSync(path.join(target, "lib/custom.dart"), "// Child change");
    assert.equal(
      fs.readFileSync(path.join(workspace, "lib/custom.dart"), "utf8"),
      "// Arbitrary custom code",
    );
    fs.symlinkSync("/etc", path.join(workspace, "assets/escape"));
    await assert.rejects(
      service.create({
        ...args,
        requestId: "symlink",
        projects: [{ name: "safe", brief: "No escape" }],
      }),
      /symlink/,
    );
    assert.equal(
      fs.existsSync(path.join(owner.folder, "projects/safe")),
      false,
    );
  } finally {
    await child?.close();
    await parent?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
