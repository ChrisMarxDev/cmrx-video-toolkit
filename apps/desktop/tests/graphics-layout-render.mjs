import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Playground } from "../src/playground.mjs";
const root = fs.mkdtempSync(
  path.join(
    process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
    "cmrx-graphics-layout-",
  ),
);
const workspace = path.join(root, "project");
fs.mkdirSync(workspace);
process.env.CHAT_WORKER_ROOT ||= path.join(root, "worker");
let playground;
try {
  fs.writeFileSync(
    path.join(workspace, "project.json"),
    JSON.stringify({
      schemaVersion: 1,
      revision: 0,
      name: "Positioned widget contract",
      width: 640,
      height: 360,
      fps: 30,
      assets: [],
      clips: [
        {
          id: "graphic",
          name: "Positioned graphic",
          kind: "graphics",
          start: 0,
          in: 0,
          duration: 1,
          track: 1,
          x: 0,
          y: 0,
          width: 640,
          height: 360,
          muted: false,
          props: { source: "lib/positioned.dart" },
        },
      ],
    }),
  );
  playground = new Playground({ workspace });
  playground.write(
    "lib/positioned.dart",
    "import 'package:flutter/widgets.dart'; Widget buildGraphics(double time,Map<String,dynamic> manifest)=>const Positioned(left:20,top:20,width:120,height:80,child:ColoredBox(color:Color(0xFFFF0000)));\n",
  );
  const job = await playground.render(0);
  await playground.renderTask;
  const done = playground.jobs.find((j) => j.id === job.id);
  assert.equal(done.status, "complete", done.error);
  const pixels = execFileSync(
    process.env.FFMPEG || "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      playground.artifact(job.id),
      "-frames:v",
      "1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { maxBuffer: 2 * 1024 * 1024 },
  );
  const red = (40 * 640 + 40) * 3,
    black = (200 * 640 + 400) * 3;
  assert(pixels[red] > 200 && pixels[red + 2] < 40);
  assert(
    pixels[black] < 80 && pixels[black + 1] < 80 && pixels[black + 2] < 80,
    `Graphic unexpectedly filled the background: ${Array.from(pixels.subarray(black, black + 3))}`,
  );
  const overlay = playground.overlayArtifact(job.id);
  assert(overlay);
  const alpha = execFileSync(
    process.env.FFMPEG || "ffmpeg",
    [
      "-v",
      "error",
      "-c:v",
      "libvpx-vp9",
      "-i",
      overlay,
      "-frames:v",
      "1",
      "-vf",
      "alphaextract",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "pipe:1",
    ],
    { maxBuffer: 2 * 1024 * 1024 },
  );
  assert(alpha[40 * 640 + 40] > 200);
  assert(alpha[200 * 640 + 400] < 20);
  console.log(
    "PASS real Flutter root Positioned export, transparent overlay and decoded placement.",
  );
} finally {
  await playground?.close();
  fs.rmSync(root, { recursive: true, force: true });
}
