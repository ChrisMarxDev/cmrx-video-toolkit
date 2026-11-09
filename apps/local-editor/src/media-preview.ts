import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import type { Asset } from "./model.js";
import { safeFile } from "./render.js";
const run = promisify(execFile);

export type MediaPreview = {
  offset?: number;
  sourceStart?: number;
  interval: number;
  count: number;
  columns: number;
  sprite?: string;
  peaks?: number[];
  peakRate: number;
  errors: string[];
};

// Disposable source-derived data, independent of authored clips and revisions.
export class MediaPreviews {
  private pending = new Map<string, Promise<MediaPreview>>();
  private queue: Promise<unknown> = Promise.resolve();
  private children = new Set<ChildProcess>();
  private closed = false;
  constructor(private root: string) {}
  close() {
    this.closed = true;
    for (const child of this.children) child.kill("SIGTERM");
  }
  async get(asset: Asset): Promise<MediaPreview> {
    const file = safeFile(this.root, asset.path);
    const stat = await fs.stat(file);
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          1,
          file,
          stat.size,
          stat.mtimeMs,
          asset.duration,
          asset.audio,
        ]),
      )
      .digest("hex");
    const cached = path.join(
      this.root,
      ".editor",
      "media-previews",
      `${key}.json`,
    );
    try {
      return JSON.parse(await fs.readFile(cached, "utf8"));
    } catch {}
    const existing = this.pending.get(key);
    if (existing) return existing;
    const job = this.queue.then(async () => {
      if (this.closed) throw Error("Editor stopped");
      const result = await this.generate(file, asset);
      // Failed extraction remains retryable on the next page load.
      if (!result.errors.length) {
        await fs.mkdir(path.dirname(cached), { recursive: true });
        await fs.writeFile(cached + ".tmp", JSON.stringify(result));
        await fs.rename(cached + ".tmp", cached);
      }
      return result;
    });
    this.pending.set(key, job);
    this.queue = job.catch(() => {});
    try {
      return await job;
    } finally {
      this.pending.delete(key);
    }
  }
  private async generate(file: string, asset: Asset): Promise<MediaPreview> {
    const interval = Math.max(1, asset.duration / 240);
    const count = Math.ceil(asset.duration / interval);
    const result: MediaPreview = {
      interval,
      count,
      columns: 12,
      peakRate: 100,
      errors: [],
    };
    try {
      const command = run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-nostdin",
          "-threads",
          "1",
          "-i",
          file,
          "-an",
          "-t",
          String(asset.duration),
          "-vf",
          `fps=1/${interval}:start_time=0:round=up,scale=96:54:force_original_aspect_ratio=decrease,pad=96:54:(ow-iw)/2:(oh-ih)/2,tile=12x${Math.ceil(count / 12)}`,
          "-frames:v",
          "1",
          "-threads",
          "1",
          "-f",
          "image2pipe",
          "-vcodec",
          "mjpeg",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 4 * 1024 * 1024, timeout: 120000 },
      );
      this.children.add(command.child);
      try {
        const { stdout } = await command;
        if (!stdout.length) throw Error("No video frames");
        result.sprite = `data:image/jpeg;base64,${stdout.toString("base64")}`;
      } finally {
        this.children.delete(command.child);
      }
    } catch {
      result.errors.push("Video thumbnails unavailable");
    }
    if (asset.audio && !this.closed) {
      try {
        result.peaks = await this.peaks(file, asset.duration);
      } catch {
        result.errors.push("Audio waveform unavailable");
      }
    }
    return result;
  }
  private peaks(file: string, duration: number): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        "ffmpeg",
        [
          "-v",
          "error",
          "-nostdin",
          "-threads",
          "1",
          "-i",
          file,
          "-t",
          String(duration),
          "-vn",
          "-ac",
          "2",
          "-ar",
          "8000",
          "-f",
          "s16le",
          "pipe:1",
        ],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      this.children.add(child);
      const timer = setTimeout(() => child.kill("SIGTERM"), 120000);
      const peaks: number[] = [];
      let tail = Buffer.alloc(0),
        samples = 0,
        peak = 0;
      child.stdout.on("data", (chunk: Buffer) => {
        const data = Buffer.concat([tail, chunk]);
        const length = data.length - (data.length % 2);
        for (let i = 0; i < length; i += 2) {
          peak = Math.max(peak, Math.abs(data.readInt16LE(i)) / 32768);
          if (++samples === 160) {
            peaks.push(Math.round(peak * 1000) / 1000);
            samples = 0;
            peak = 0;
          }
        }
        tail = data.subarray(length);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        this.children.delete(child);
        if (code !== 0) return reject(Error("Audio decode failed"));
        if (samples) peaks.push(Math.round(peak * 1000) / 1000);
        resolve(peaks);
      });
    });
  }
}
