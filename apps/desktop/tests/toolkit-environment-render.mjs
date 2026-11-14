// Actual Flutter/media acceptance; uses an already imported full-resolution source.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { startApp } from "../src/server.mjs";
import { ProjectServices } from "../src/project-services.mjs";
if (!process.env.EDITOR_SOURCE_PROJECT)
  throw Error("EDITOR_SOURCE_PROJECT must name a project with imported video");
const source = path.resolve(process.env.EDITOR_SOURCE_PROJECT),
  original = JSON.parse(fs.readFileSync(path.join(source, "project.json"))),
  asset = original.assets.find((a) => a.audio && a.duration > 2);
if (!asset) throw Error("Source project needs footage with audio");
const root =
    process.env.EDITOR_RESULTS ??
    fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-environment-render-")),
  workspace = path.join(root, "project");
if (fs.existsSync(path.join(workspace, "project.json")))
  throw Error(
    "Choose a new acceptance results folder; existing projects are preserved",
  );
fs.mkdirSync(workspace, { recursive: true });
const p = {
  schemaVersion: 1,
  revision: 0,
  name: "Toolkit environment acceptance",
  width: 640,
  height: 360,
  fps: 30,
  assets: [structuredClone(asset)],
  clips: [
    {
      id: "phone",
      name: asset.name,
      kind: "video",
      assetId: asset.id,
      start: 0,
      in: Math.max(0, Math.min(51, asset.duration - 2)),
      duration: 1.2,
      track: 0,
      x: 220,
      y: 0,
      width: 202,
      height: 360,
      muted: false,
    },
  ],
};
for (const file of new Set(
  [asset.path, asset.media?.original?.path].filter(Boolean),
)) {
  fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
  fs.copyFileSync(
    path.join(source, file),
    path.join(workspace, file),
    fs.constants.COPYFILE_FICLONE,
  );
}
fs.writeFileSync(path.join(workspace, "project.json"), JSON.stringify(p));
let app;
const redSource =
  "import 'package:flutter/widgets.dart'; Widget buildGraphics(double time,Map<String,dynamic> manifest){final p=Map<String,dynamic>.from(manifest['graphicsClip']['props']);final hex=(p['color'] as String).substring(1);return Positioned(left:20,top:20,width:(p['width'] as num).toDouble(),height:80,child:ColoredBox(color:Color(int.parse('FF'+hex,radix:16))));}\n";
const pixel = (file, time) => {
  const bytes = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(time),
      "-i",
      file,
      "-frames:v",
      "1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { maxBuffer: 2 * 1024 ** 2 },
  );
  return [...bytes.subarray((40 * 640 + 40) * 3, (40 * 640 + 40) * 3 + 3)];
};
const evidence = [];
try {
  app = await startApp({ workspace, autoPreview: false });
  const svc = new ProjectServices({
    workspace,
    editor: app.editor,
    playground: app.playground,
  });
  app.playground.write("lib/dynamically_authored.dart", redSource);
  let doc = (await app.editor("/api/context")).project;
  await app.editor("/api/operations", {
    revision: doc.revision,
    operations: [
      {
        type: "transcript",
        assetId: asset.id,
        transcript: [
          {
            start: p.clips[0].in + 0.4,
            end: p.clips[0].in + 0.7,
            text: "Anchor evidence",
          },
        ],
      },
      {
        type: "component",
        definition: {
          id: "created-at-runtime",
          schemaVersion: 1,
          source: "lib/dynamically_authored.dart",
          properties: {
            color: { type: "color" },
            width: { type: "number", min: 20, max: 300 },
          },
          defaults: { color: "#ff0000", width: 120 },
        },
      },
      {
        type: "add-graphics",
        id: "dynamic",
        componentId: "created-at-runtime",
        duration: 0.5,
        track: 1,
      },
    ],
  });
  doc = (await app.editor("/api/context")).project;
  const cue = doc.assets[0].transcript[0];
  await app.editor("/api/anchor", {
    revision: doc.revision,
    id: "dynamic",
    anchor: {
      type: "semantic",
      assetId: asset.id,
      cueId: cue.id,
      clipId: "phone",
    },
  });
  async function render(label, at, color) {
    const ctx = await app.editor("/api/context"),
      job = await app.playground.render(ctx.project.revision);
    await app.playground.renderTask;
    const done = app.playground.jobs.find((j) => j.id === job.id);
    assert.equal(done.status, "complete", done.error);
    const value = pixel(app.playground.artifact(job.id), at);
    assert.ok(
      color === "red"
        ? value[0] > 200 && value[2] < 50
        : value[2] > 200 && value[0] < 50,
      label + ": " + value,
    );
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
          app.playground.artifact(job.id),
        ],
        { encoding: "utf8" },
      ),
    );
    assert.ok(media.streams.some((s) => s.codec_type === "audio"));
    assert.ok(Math.abs(Number(media.format.duration) - 1.2) < 0.07);
    evidence.push({
      label,
      jobId: job.id,
      pixel: value,
      mediaDuration: media.format.duration,
    });
    return done;
  }
  await render("schema defaults render red at source cue", 0.6, "red");
  doc = (await app.editor("/api/context")).project;
  const checkpoint = await svc.run("checkpoint-create", {
    revision: doc.revision,
    label: "Red dynamic source",
  });
  await app.editor("/api/operations", {
    revision: doc.revision,
    operations: [
      { type: "split", id: "phone", time: 0.3 },
      {
        type: "component-props",
        id: "dynamic",
        props: { color: "#0000ff", width: 180 },
      },
    ],
  });
  const split = (await app.editor("/api/context")).project;
  assert.notEqual(
    split.clips.find((c) => c.id === "dynamic").anchor.clipId,
    "phone",
  );
  app.playground.write(
    "lib/dynamically_authored.dart",
    redSource.replace("height:80", "height:90"),
  );
  await render(
    "changed props/code and split occurrence render blue",
    0.6,
    "blue",
  );
  doc = (await app.editor("/api/context")).project;
  await svc.run("checkpoint-restore", {
    id: checkpoint.id,
    revision: doc.revision,
  });
  assert.equal(app.playground.read("lib/dynamically_authored.dart"), redSource);
  await render("whole-project restore renders red again", 0.6, "red");
  const window = await svc.run("source-window", {
    assetId: asset.id,
    start: p.clips[0].in,
    duration: 1.2,
  });
  assert.equal(window.cues[0].id, cue.id);
  assert.ok(window.levels.some((v) => v > 0));
  assert.ok(window.frames.length);
  fs.writeFileSync(
    path.join(root, "acceptance.json"),
    JSON.stringify(
      {
        source: asset.media?.original?.sha256 ?? asset.path,
        evidence,
        sourceWindow: {
          clock: window.clock,
          frames: window.frames.length,
          levels: window.levels.length,
          cue: window.cues[0],
        },
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS actual Flutter over phone footage: defaults, changed properties/code, anchor split, source/audio evidence, whole-project restore and re-render. Evidence:",
    root,
  );
} finally {
  await app?.close();
}
