import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const inRoot = (root, file) => {
  if (fs.lstatSync(root).isSymbolicLink())
    throw Error("Media folder cannot be a symlink");
  const p = fs.realpathSync(file),
    r = fs.realpathSync(root);
  if (!p.startsWith(r + path.sep)) throw Error("Media is outside the project");
  return p;
};
function png(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-protocol_whitelist",
        "file,pipe,crypto,data",
        ...args,
        "-frames:v",
        "1",
        "-vf",
        "scale=960:960:force_original_aspect_ratio=decrease",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks = [];
    let size = 0,
      err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), 30000);
    p.stdout.on("data", (d) => {
      size += d.length;
      if (size > 4000000) p.kill();
      else chunks.push(d);
    });
    p.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code || !size)
        reject(Error("Could not inspect this image/frame: " + err));
      else resolve(Buffer.concat(chunks).toString("base64"));
    });
  });
}
export async function inspectFrame({ workspace, project, playground, args }) {
  const time = args.time ?? 0;
  if (!Number.isFinite(time) || time < 0 || time > 600)
    throw Error("Choose a time from 0 to 600 seconds");
  let file, label;
  if (args.assetId) {
    const asset = project.assets.find((a) => a.id === args.assetId);
    if (!asset) throw Error("Asset not found");
    file = inRoot(
      path.join(workspace, "media"),
      path.resolve(workspace, asset.path),
    );
    label = `Source ${asset.name} at ${time}s`;
  } else {
    const job = playground.jobs.find((j) => j.id === args.jobId);
    if (!job) throw Error("Choose a completed render job from editor_context");
    file = playground.artifact(job.id) || playground.overlayArtifact(job.id);
    if (!file) throw Error("Render is not complete");
    file = inRoot(playground.jobsDir, file);
    label = `${job.kind === "overlay" ? "Graphics only" : "Rendered composition"}, revision ${job.revision}, ${time}s`;
  }
  return {
    content: [
      { type: "text", text: label },
      {
        type: "image",
        mimeType: "image/png",
        data: await png(["-ss", String(time), "-i", file]),
      },
    ],
  };
}
export async function inspectImage(workspace, name) {
  if (typeof name !== "string" || !/^assets\//.test(name))
    throw Error("Choose an image in assets/");
  const file = inRoot(
    path.join(workspace, "assets"),
    path.resolve(workspace, name),
  );
  return {
    content: [
      { type: "image", mimeType: "image/png", data: await png(["-i", file]) },
    ],
  };
}
