import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

// Disposable playback media only. Never used as an asset or export input.
export class PlaybackProxies {
  constructor(root) {
    this.root = root;
    fs.mkdirSync(root, { recursive: true });
    this.entries = new Map();
    this.queue = Promise.resolve();
    this.children = new Set();
    this.closed = false;
  }
  run(command, args) {
    if (this.closed) return Promise.reject(Error("Preview service stopped"));
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      this.children.add(child);
      let output = "",
        error = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), 600000);
      child.stdout.on("data", (d) => (output = (output + d).slice(-1000000)));
      child.stderr.on("data", (d) => (error = (error + d).slice(-4000)));
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        this.children.delete(child);
        if (code || this.closed)
          reject(Error(error || "Preview generation stopped"));
        else resolve(output);
      });
    });
  }
  request(source, quality, alpha = false, retry = false, refresh = false) {
    if (!["720", "1080"].includes(String(quality)))
      throw Error("Unknown preview quality");
    const stat = fs.statSync(source, { bigint: true });
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          1,
          source,
          String(stat.size),
          String(stat.mtimeNs),
          String(stat.ctimeNs),
          String(quality),
          alpha,
        ]),
      )
      .digest("hex");
    const file = path.join(this.root, key + (alpha ? ".webm" : ".mp4"));
    const receipt = path.join(this.root, key + ".json");
    let entry = this.entries.get(key);
    if (
      entry?.status === "ready" &&
      (!fs.existsSync(entry.file) ||
        fs.lstatSync(entry.file).isSymbolicLink() ||
        fs.statSync(entry.file).size !== entry.bytes)
    ) {
      this.entries.delete(key);
      entry = null;
    }
    if (entry && entry.status === "preparing") return entry;
    if (entry && !refresh && !(retry && entry.status === "failed"))
      return entry;
    try {
      if (refresh) throw Error("Rebuilding playback cache");
      const saved = JSON.parse(fs.readFileSync(receipt));
      if (
        saved.key === key &&
        saved.status === "ready" &&
        fs.lstatSync(file).isFile() &&
        !fs.lstatSync(file).isSymbolicLink() &&
        fs.statSync(file).size === saved.bytes
      ) {
        entry = { ...saved, file };
        this.entries.set(key, entry);
        return entry;
      }
    } catch {}
    entry = { status: "preparing", key };
    this.entries.set(key, entry);
    const temporary = path.join(
      this.root,
      key + ".part" + (alpha ? ".webm" : ".mp4"),
    );
    this.queue = this.queue.then(async () => {
      try {
        const probe = JSON.parse(
          await this.run("ffprobe", [
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            source,
          ]),
        );
        const video = probe.streams.find((s) => s.codec_type === "video");
        if (!video) throw Error("No video stream");
        const rotation = Number(
          video.side_data_list?.find((s) => s.rotation !== undefined)
            ?.rotation ||
            video.tags?.rotate ||
            0,
        );
        const rotated = Math.abs(rotation) % 180 === 90;
        const sourceWidth = rotated ? video.height : video.width;
        const sourceHeight = rotated ? video.width : video.height;
        const limit = Number(quality);
        const ratio = Math.min(
          1,
          limit / Math.min(sourceWidth, sourceHeight),
          (limit * 16) / 9 / Math.max(sourceWidth, sourceHeight),
        );
        const width = Math.max(2, Math.floor((sourceWidth * ratio) / 2) * 2);
        const height = Math.max(2, Math.floor((sourceHeight * ratio) / 2) * 2);
        if (width === video.width && height === video.height) {
          Object.assign(entry, {
            status: "ready",
            file: source,
            bytes: Number(stat.size),
            width,
            height,
            original: true,
          });
          return;
        }
        fs.rmSync(temporary, { force: true });
        await this.run("ffmpeg", [
          "-v",
          "error",
          "-nostdin",
          "-protocol_whitelist",
          "file,pipe",
          "-threads",
          "2",
          ...(alpha ? ["-c:v", "libvpx-vp9"] : []),
          "-i",
          source,
          "-map",
          "0:v:0",
          ...(alpha ? [] : ["-map", "0:a:0?"]),
          "-filter_threads",
          "1",
          "-vf",
          `scale=${width}:${height}:flags=bilinear,setsar=1`,
          ...(alpha
            ? [
                "-c:v",
                "libvpx-vp9",
                "-pix_fmt",
                "yuva420p",
                "-auto-alt-ref",
                "0",
                "-deadline",
                "realtime",
                "-cpu-used",
                "8",
                "-row-mt",
                "1",
                "-crf",
                "32",
                "-b:v",
                "0",
                "-an",
              ]
            : [
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "23",
                "-pix_fmt",
                "yuv420p",
                "-g",
                "15",
                "-keyint_min",
                "15",
                "-sc_threshold",
                "0",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
              ]),
          "-threads",
          "2",
          "-fps_mode",
          "passthrough",
          temporary,
        ]);
        const check = JSON.parse(
          await this.run("ffprobe", [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            temporary,
          ]),
        );
        const output = check.streams.find((s) => s.codec_type === "video");
        const rate = (value) => {
          const [a, b = 1] = String(value).split("/").map(Number);
          return a / b;
        };
        const fps = rate(video.avg_frame_rate);
        if (
          output?.width !== width ||
          output?.height !== height ||
          Math.abs(
            Number(check.format.duration) - Number(probe.format.duration),
          ) > Math.max(0.1, 2 / (fps || 30)) ||
          (Number.isFinite(fps) &&
            Math.abs(rate(output.avg_frame_rate) - fps) > 0.01) ||
          (!alpha &&
            probe.streams.some((s) => s.codec_type === "audio") &&
            !check.streams.some((s) => s.codec_type === "audio")) ||
          (alpha &&
            !Object.entries(output.tags || {}).some(
              ([k, v]) => k.toLowerCase() === "alpha_mode" && String(v) === "1",
            ))
        )
          throw Error(
            "Preview timing, dimensions or media did not match the original",
          );
        fs.renameSync(temporary, file);
        Object.assign(entry, {
          status: "ready",
          file,
          width,
          height,
          bytes: fs.statSync(file).size,
          original: false,
        });
        fs.writeFileSync(
          receipt + ".tmp",
          JSON.stringify({ ...entry, file: undefined }),
        );
        fs.renameSync(receipt + ".tmp", receipt);
      } catch (error) {
        try {
          fs.writeFileSync(
            path.join(this.root, key + ".error.log"),
            String(error.message).slice(-8000),
          );
        } catch {}
        Object.assign(entry, {
          status: "failed",
          error: "Preview unavailable; using original video.",
        });
      } finally {
        fs.rmSync(temporary, { force: true });
        fs.rmSync(receipt + ".tmp", { force: true });
      }
    });
    return entry;
  }
  async close() {
    this.closed = true;
    for (const child of this.children) {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (this.children.has(child)) child.kill("SIGKILL");
      }, 2000).unref();
    }
    await this.queue;
  }
}
export function publicProxy(entry) {
  const { file, bytes, key, ...result } = entry;
  return result;
}
