import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const option = (name) => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes("--app") || !process.argv.includes("--output"))
  throw Error(
    "Usage: node verify-linux.mjs --app /path/to/application --output /empty/test/folder",
  );
const directory = path.resolve(option("--app"));
const output = path.resolve(option("--output"));
if (!process.argv.includes("--inside")) {
  if (fs.existsSync(output)) throw Error("Choose a new test output folder");
  fs.mkdirSync(output, { recursive: true });
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    path.join(directory, "electron"),
    [process.argv[1], "--inside", "--app", directory, "--output", output],
    {
      env: {
        HOME: path.join(output, "profile"),
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: "inherit",
      timeout: 1200000,
    },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const appRoot = path.join(directory, "resources/app");
const { configureBundledEngine } = await import(
  appRoot + "/apps/desktop/src/bundled-engine.mjs"
);
const home = process.env.HOME;
configureBundledEngine({ root: appRoot, data: home });
const { engineStatus } = await import(
  appRoot + "/apps/desktop/src/engine-status.mjs"
);
assert.equal(engineStatus().available, true, JSON.stringify(engineStatus()));
assert(process.env.CHAT_FLUTTER_SDK.startsWith(appRoot));
assert(process.env.PUB_CACHE.startsWith(appRoot));
assert(!fs.existsSync(path.join(home, ".pub-cache")));
const workspace = path.join(home, "workspace");
fs.mkdirSync(path.join(workspace, "media"), { recursive: true });
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=gray:s=320x180:r=12:d=2",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=2",
  "-c:v",
  "libx264",
  "-threads",
  "1",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-shortest",
  path.join(workspace, "media/source.mp4"),
]);
fs.writeFileSync(
  path.join(workspace, "project.json"),
  JSON.stringify({
    schemaVersion: 1,
    revision: 0,
    name: "Packaged engine acceptance",
    width: 320,
    height: 180,
    fps: 12,
    assets: [
      {
        id: "video",
        path: "media/source.mp4",
        name: "Synthetic source",
        audio: true,
        duration: 2,
        width: 320,
        height: 180,
      },
    ],
    clips: [
      {
        id: "footage",
        kind: "video",
        name: "Footage",
        assetId: "video",
        start: 0,
        in: 0,
        duration: 2,
        track: 0,
        x: 0,
        y: 0,
        width: 320,
        height: 180,
        muted: false,
      },
    ],
    comments: [],
  }),
);
const { startApp } = await import(appRoot + "/apps/desktop/src/server.mjs");
const app = await startApp({
  workspace,
  autoPreview: false,
  providerFactory: () => ({ async start() {}, close() {} }),
});
try {
  app.playground.write(
    "lib/package_probe.dart",
    `import 'package:flutter/widgets.dart';
Widget buildGraphics(double time,Map<String,dynamic> manifest)=>Align(alignment:Alignment(-0.6+time*0.6,0),child:Container(width:80,height:80,color:const Color(0xffd5ff45)));`,
  );
  await app.editor("/api/add-graphics", {
    revision: 0,
    name: "New authored code",
    source: "lib/package_probe.dart",
    duration: 2,
    start: 0,
    track: 1,
  });
  const job = await app.playground.render(1);
  console.log("Rendering", job.id);
  await app.playground.renderTask;
  const result = app.playground.jobs.find((j) => j.id === job.id);
  fs.writeFileSync(
    path.join(home, "result.json"),
    JSON.stringify(result, null, 2),
  );
  assert.equal(result.status, "complete", result.error);
  assert(app.playground.worker.startsWith(home));
  assert(
    !fs.existsSync(
      path.join(app.playground.worker, "fluvie/.dart_tool/package_config.json"),
    ) ||
      !fs
        .readFileSync(
          path.join(
            app.playground.worker,
            "fluvie/.dart_tool/package_config.json",
          ),
          "utf8",
        )
        .includes("/home/chrismarx/fvm"),
  );
  const output = app.playground.artifact(job.id);
  execFileSync("ffmpeg", ["-v", "error", "-i", output, "-f", "null", "-"]);
  const probe = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      output,
    ]),
  );
  assert.equal(probe.streams.find((s) => s.codec_type === "video").width, 320);
  assert(probe.streams.some((s) => s.codec_type === "audio"));
  assert(Math.abs(Number(probe.format.duration) - 2) < 0.1);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(workspace, "project.json"))).clips
      .length,
    2,
  );
  console.log(
    "PASS: packaged Electron Node, SDK and offline cache render newly authored editable Flutter layer with footage/audio; exact duration, dimensions and decode.",
  );
} finally {
  await app.close();
}
