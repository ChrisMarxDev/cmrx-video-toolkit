import fs from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
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
  if (!Number.isFinite(time) || time < 0)
    throw Error("Choose a nonnegative source/render time");
  let file, label;
  if (args.assetId) {
    const asset = project.assets.find((a) => a.id === args.assetId);
    if (!asset) throw Error("Asset not found");
    if (time >= asset.duration)
      throw Error("Choose a frame inside the source duration");
    file = inRoot(
      path.join(workspace, "media"),
      path.resolve(workspace, asset.path),
    );
    label = `Source ${asset.name} at ${time}s`;
  } else {
    const job = playground.jobs.find((j) => j.id === args.jobId);
    if (!job) throw Error("Choose a completed render job from editor_context");
    if (Number.isFinite(job.duration) && time >= job.duration)
      throw Error("Choose a frame inside the rendered output duration");
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

export async function inspectAudio({ workspace, project, playground, args }) {
  if (!!args.assetId === !!args.jobId)
    throw Error("Choose one source asset or completed export job");
  let file;
  if (args.assetId) {
    const asset = project.assets.find((a) => a.id === args.assetId);
    if (!asset) throw Error("Asset not found");
    file = inRoot(
      path.join(workspace, "media"),
      path.resolve(workspace, asset.path),
    );
  } else {
    file = playground.artifact(args.jobId);
    if (!file) throw Error("Choose a completed export job");
    file = inRoot(playground.jobsDir, file);
  }
  const options = { timeout: 30000, maxBuffer: 1024 * 1024 };
  const { stdout } = await execute(
    "ffprobe",
    [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe,crypto,data",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ],
    options,
  );
  const media = JSON.parse(stdout),
    audio = media.streams.find((s) => s.codec_type === "audio");
  if (!audio) return { hasAudio: false };
  const start = args.start ?? 0;
  const duration =
    args.duration ?? Math.min(600, Number(media.format.duration) - start);
  if (
    !Number.isFinite(start) ||
    start < 0 ||
    start >= Number(media.format.duration) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 600
  )
    throw Error("Choose a valid audio range up to 600 seconds");
  const { stderr } = await execute(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostdin",
      "-nostats",
      "-protocol_whitelist",
      "file,pipe,crypto,data",
      "-ss",
      String(start),
      "-i",
      file,
      "-t",
      String(duration),
      "-map",
      "0:a:0",
      "-vn",
      "-af",
      "astats=metadata=0:reset=0",
      "-f",
      "null",
      "-",
    ],
    options,
  );
  const overall = stderr.slice(stderr.lastIndexOf("Overall"));
  const level = (name) => {
    const value = Number(
      new RegExp(name + ":\\s*(-?[0-9.]+|[-+]?inf)").exec(overall)?.[1],
    );
    return Number.isFinite(value) ? value : null;
  };
  const peakDbFS = level("Peak level dB"),
    rmsDbFS = level("RMS level dB");
  const sampleCount = Number(/Number of samples:\s*(\d+)/.exec(overall)?.[1]);
  if (!sampleCount) throw Error("No audio samples could be measured");
  return {
    hasAudio: true,
    start,
    duration: Math.min(duration, Number(media.format.duration) - start),
    channels: audio.channels,
    sampleRate: Number(audio.sample_rate),
    sampleCount,
    peakDbFS,
    rmsDbFS,
    silent: peakDbFS === null,
    clippingRisk: peakDbFS !== null && peakDbFS >= 0,
    method:
      "FFmpeg astats overall sample peak and RMS in dBFS; not integrated loudness",
  };
}
