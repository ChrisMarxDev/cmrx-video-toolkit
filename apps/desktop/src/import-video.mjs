import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";

function run(command, args, signal, progress) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const p = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "",
      progressBuffer = "",
      killTimer;
    const abort = () => {
      p.kill("SIGTERM");
      killTimer = setTimeout(() => p.kill("SIGKILL"), 2000);
    };
    signal?.addEventListener("abort", abort, { once: true });
    p.stdout.on("data", (d) => {
      out = (out + d).slice(-1000000);
      if (!progress) return;
      progressBuffer += String(d);
      const lines = progressBuffer.split("\n");
      progressBuffer = lines.pop();
      for (const line of lines) {
        const match = /^out_time_us=(\d+)$/.exec(line.trim());
        if (match) progress?.(Number(match[1]) / 1000000);
      }
    });
    p.stderr.resume();
    p.on("error", () => {
      signal?.removeEventListener("abort", abort);
      reject(Error("The video engine could not start"));
    });
    p.on("close", (code) => {
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) reject(Error("Video import canceled"));
      else if (code)
        reject(Error("This video could not be prepared. Try another file."));
      else resolve(out);
    });
  });
}
export async function importVideo({
  workspace,
  source,
  editor,
  onProgress = () => {},
  signal,
}) {
  const selectedName = path.basename(path.resolve(source));
  const absolute = fs.realpathSync(source);
  if (!fs.statSync(absolute).isFile()) throw Error("Choose a video file");
  onProgress("Reading your video…");
  const probe = JSON.parse(
    await run(
      process.env.FFPROBE || "ffprobe",
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", absolute],
      signal,
    ),
  );
  const video = probe.streams.find(
    (s) => s.codec_type === "video" && !s.disposition?.attached_pic,
  );
  const duration = Number(probe.format.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0)
    throw Error("This file has no playable video");
  const current = (await editor("/api/context")).project;
  const start = current.clips.reduce(
    (end, c) => Math.max(end, c.start + c.duration),
    0,
  );
  if (start + duration > 600)
    throw Error(
      "This preview supports projects up to 10 minutes. Choose a shorter video.",
    );
  const [a, b] = String(video.avg_frame_rate || "30/1")
    .split("/")
    .map(Number);
  const rate = a / (b || 1);
  const rotation = Number(
    video.side_data_list?.find((x) => x.rotation !== undefined)?.rotation ||
      video.tags?.rotate ||
      0,
  );
  const rotated = Math.abs(rotation) % 180 === 90;
  const originalWidth = rotated ? video.height : video.width,
    originalHeight = rotated ? video.width : video.height;
  if (
    Math.max(originalWidth, originalHeight) > 3840 ||
    Math.min(originalWidth, originalHeight) > 2160
  )
    throw Error(
      "Videos up to 3840×2160 landscape or 2160×3840 portrait are supported. Your original was not changed.",
    );
  const width = Math.max(64, Math.floor(originalWidth / 2) * 2),
    height = Math.max(64, Math.floor(originalHeight / 2) * 2);
  const fps = Number.isInteger(rate) && rate >= 1 && rate <= 60 ? rate : 30;
  const hdr = ["smpte2084", "arib-std-b67"].includes(video.color_transfer);
  const compatible =
    path.extname(absolute).toLowerCase() === ".mp4" &&
    video.codec_name === "h264" &&
    video.pix_fmt === "yuv420p" &&
    !rotated &&
    !hdr &&
    width === originalWidth &&
    height === originalHeight &&
    fps === rate &&
    probe.streams
      .filter((s) => s.codec_type === "audio")
      .every((s) => s.codec_name === "aac");
  const id = "asset-" + randomUUID(),
    relative = "media/" + id + ".mp4",
    dest = path.join(workspace, relative);
  const originalFile = compatible
    ? relative
    : `media/originals/${id}${path.extname(selectedName)}`;
  const originalDest = path.join(workspace, originalFile);
  fs.mkdirSync(path.dirname(originalDest), { recursive: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    if (compatible) {
      onProgress("Copying your video…");
      await pipeline(
        fs.createReadStream(absolute),
        fs.createWriteStream(dest),
        { signal },
      );
    } else {
      onProgress("Keeping your original…");
      await pipeline(
        fs.createReadStream(absolute),
        fs.createWriteStream(originalDest),
        { signal },
      );
      onProgress("Preparing playback… 0%");
      const filters = [
        ...(hdr
          ? [
              "zscale=t=linear:npl=100",
              "format=gbrpf32le",
              "zscale=p=bt709",
              "tonemap=tonemap=hable:desat=0",
              "zscale=t=bt709:m=bt709:r=tv",
            ]
          : []),
        `scale=${width}:${height}:flags=lanczos`,
        `fps=${fps}`,
      ];
      await run(
        process.env.FFMPEG || "ffmpeg",
        [
          "-v",
          "error",
          "-nostdin",
          "-i",
          originalDest,
          "-progress",
          "pipe:1",
          "-nostats",
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-vf",
          filters.join(","),
          "-c:v",
          "libx264",
          "-threads",
          "2",
          "-preset",
          "veryfast",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart",
          dest,
        ],
        signal,
        (seconds) =>
          onProgress(
            `Preparing playback… ${Math.min(99, Math.floor((seconds / duration) * 100))}%`,
          ),
      );
    }
    const sha = createHash("sha256");
    for await (const chunk of fs.createReadStream(absolute)) {
      signal?.throwIfAborted();
      sha.update(chunk);
    }
    signal?.throwIfAborted();
    const latest = (await editor("/api/context")).project;
    if (latest.revision !== current.revision)
      throw Error("Your project changed during import. Please try again.");
    const project = structuredClone(latest);
    if (!project.clips.length) Object.assign(project, { width, height, fps });
    project.assets.push({
      id,
      name: selectedName,
      path: relative,
      duration,
      audio: probe.streams.some((s) => s.codec_type === "audio"),
      provenance: {
        original: absolute,
        originalFile,
        sha256: sha.digest("hex"),
        playback: compatible
          ? "Exact source copy"
          : `${width}×${height} H.264 playback copy`,
        originalDimensions: [originalWidth, originalHeight],
      },
    });
    const fit = Math.min(project.width / width, project.height / height);
    const clipWidth = Math.round(width * fit),
      clipHeight = Math.round(height * fit);
    project.clips.push({
      id: "clip-" + randomUUID(),
      kind: "video",
      name: selectedName,
      assetId: id,
      start,
      in: 0,
      duration,
      track: 0,
      x: (project.width - clipWidth) / 2,
      y: (project.height - clipHeight) / 2,
      width: clipWidth,
      height: clipHeight,
      muted: false,
      props: {},
    });
    await editor("/api/project", { revision: latest.revision, project });
    return { assetId: id, width, height, duration, exactCopy: compatible };
  } catch (error) {
    fs.rmSync(dest, { force: true });
    if (originalDest !== dest) fs.rmSync(originalDest, { force: true });
    throw error;
  }
}
