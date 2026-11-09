// Makes a browser-compatible proxy; never edits or moves the original recording.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const root = path.resolve(arg("--workspace", "workspaces/demo")),
  source = arg("--source", "");
if (!source)
  throw Error(
    "Usage: npm run import -- --source /path/to/video.mp4 [--workspace workspaces/demo]",
  );
const connection = JSON.parse(
  fs.readFileSync(path.join(root, ".editor/connection.json"), "utf8"),
);
const headers = {
  Authorization: `Bearer ${connection.token}`,
  "Content-Type": "application/json",
};
const state = await fetch(connection.url + "/api/state", { headers }).then(
  (r) => r.json(),
);
if (state.error) throw Error(state.error);
const id = `asset-${randomUUID()}`,
  relative = `media/${id}.mp4`;
execFileSync(
  process.env.FFMPEG || "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    path.resolve(source),
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,fps=24",
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    path.join(root, relative),
  ],
  { stdio: "inherit" },
);
const info = JSON.parse(
  execFileSync(
    process.env.FFPROBE || "ffprobe",
    [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      path.join(root, relative),
    ],
    { encoding: "utf8" },
  ),
);
state.project.assets.push({
  id,
  name: path.basename(source),
  path: relative,
  duration: Number(info.format.duration),
  audio: info.streams.some((s) => s.codec_type === "audio"),
  provenance: {
    original: path.resolve(source),
    proxy: "640x360 letterboxed H.264/AAC; original untouched",
  },
});
const r = await fetch(connection.url + "/api/project", {
  method: "POST",
  headers,
  body: JSON.stringify({
    revision: state.project.revision,
    project: state.project,
  }),
});
if (!r.ok)
  throw Error(
    `Import conflict: ${await r.text()}. Proxy is preserved at ${relative}; retry adding its asset metadata against the current revision.`,
  );
console.log(
  `Imported ${path.basename(source)}. It is now in Takes. Original untouched.`,
);
