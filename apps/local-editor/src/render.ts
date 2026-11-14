import { resolveProject } from "../../../flow/project/resolve.mjs";
import {
  captureFiles,
  describeInputs,
  createRenderJob,
  requestCancellation,
} from "./render-contract.mjs";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { end, clone, type Project, type Box, type Job } from "./model.js";
import { atomic } from "./workspace.js";
export type Extension = {
  manifest: {
    id: string;
    worker?: string;
    capabilities?: Record<string, number>;
    name: string;
    kind: string;
    browser?: string;
    commands: { id: string; label: string }[];
  };
  dir: string;
  validateClip?: (clip: import("./model.js").Clip) => void;
  boxes: (c: any) => Box[];
  command: (p: Project, id: string) => Project;
};
export function safeFile(root: string, relative: string) {
  const full = fs.realpathSync(path.resolve(root, relative));
  const base = fs.realpathSync(root) + path.sep;
  if (!full.startsWith(base)) throw Error("Path escapes workspace");
  return full;
}
export function getBoxes(p: Project, extensions: Extension[]) {
  const result: Record<string, Box[]> = {};
  for (const c of p.clips) {
    if (p.layers?.[c.track]?.disabled) continue;
    const ext = extensions.find((e) => e.manifest.kind === c.kind);
    if (!ext) continue;
    if (!ext.manifest.capabilities?.render && ext.manifest.capabilities)
      throw Error("Extension does not support rendering");
    const boxes = ext.boxes(clone(c));
    if (!Array.isArray(boxes) || boxes.length > 100)
      throw Error("Invalid extension geometry");
    for (const b of boxes)
      if (
        ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
        b.x < 0 ||
        b.y < 0 ||
        b.width < 1 ||
        b.height < 1 ||
        b.x + b.width > c.width ||
        b.y + b.height > c.height ||
        !/^#[a-f0-9]{6}$/i.test(b.color)
      )
        throw Error("Extension boxes must fit clip and use #RRGGBB");
    result[c.id] = boxes;
  }
  return result;
}
export class Renderer {
  // FFmpeg 7+ supports file-valued options; 9 removed the legacy spelling.
  // Probe the selected binary once and keep graphs in files (they can exceed
  // platform command-line limits for many clips/extension rectangles).
  filterFileOption: string;
  engineVersion: string;
  jobs: Job[] = [];
  processes = new Map<string, ChildProcess>();
  dir: string;
  constructor(
    private root: string,
    private extensions: Extension[],
    private changed: () => void,
  ) {
    const help = spawnSync(
      process.env.FFMPEG || "ffmpeg",
      ["-hide_banner", "-h", "full"],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 10000,
      },
    );
    this.engineVersion =
      spawnSync(process.env.FFMPEG || "ffmpeg", ["-version"], {
        encoding: "utf8",
        timeout: 10000,
      }).stdout?.split("\n")[0] || "unavailable";
    this.filterFileOption = /-filter_complex_script\s/.test(help.stdout || "")
      ? "-filter_complex_script"
      : "-/filter_complex";
    this.dir = path.join(root, ".editor", "jobs");
    fs.mkdirSync(this.dir, { recursive: true });
    for (const file of fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(".json") && !f.includes(".input."))) {
      try {
        const job: Job = JSON.parse(
          fs.readFileSync(path.join(this.dir, file), "utf8"),
        );
        if (job.status === "running") {
          job.status = "interrupted";
          job.error = "Service stopped before completion";
          atomic(path.join(this.dir, file), job);
        }
        this.jobs.push(job);
      } catch {}
    }
  }
  save(job: Job) {
    atomic(path.join(this.dir, `${job.id}.json`), job);
    this.changed();
  }
  start(project: Project) {
    if (this.processes.size) throw Error("One render at a time in this MVP");
    const p = resolveProject(project).project as Project,
      boxes = getBoxes(p, this.extensions),
      duration = end(p),
      id = randomUUID();
    const inputRoot = path.join(this.dir, `${id}.inputs`);
    fs.mkdirSync(inputRoot, { recursive: true });
    const inputPaths = p.assets.map((a) => a.path);
    captureFiles(this.root, inputRoot, inputPaths);
    const manifest = describeInputs(inputRoot, p, inputPaths, {
      id: "ffmpeg",
      version: this.engineVersion,
      contractVersion: 1,
      filterFileOption: this.filterFileOption,
      extensions: this.extensions.map((e) => ({
        id: e.manifest.id,
        manifest: e.manifest,
        worker: e.manifest.worker ? e.manifest.worker : null,
      })),
      boxes,
    });
    atomic(path.join(inputRoot, "manifest.json"), manifest);
    const args = [
      "-hide_banner",
      "-y",
      "-filter_complex_threads",
      "1",
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=${p.width}x${p.height}:r=${p.fps}:d=${duration}`,
    ];
    const clips = p.clips
      .filter((c) => !p.layers?.[c.track]?.disabled)
      .sort(
        (a, b) =>
          a.track - b.track || a.start - b.start || a.id.localeCompare(b.id),
      );
    let n = 1;
    const indices = new Map<string, number>();
    for (const c of clips)
      if (c.kind === "video") {
        const asset = p.assets.find((a) => a.id === c.assetId)!;
        args.push(
          "-ss",
          String(c.in),
          "-t",
          String(c.duration),
          "-i",
          safeFile(inputRoot, asset.path),
        );
        indices.set(c.id, n++);
      } else if (!boxes[c.id])
        throw Error(
          `Cannot render unknown kind ${c.kind}; install its extension or render it to media first`,
        );
    const filters: string[] = [];
    let last = "0:v",
      layer = 0;
    const audio: string[] = [];
    for (const c of clips) {
      const next = `layer${layer++}`,
        enabled = `gte(t,${c.start})*lt(t,${c.start + c.duration})`;
      if (c.kind === "video") {
        const i = indices.get(c.id)!;
        filters.push(
          `[${i}:v]trim=start=0:duration=${c.duration},setpts=PTS-STARTPTS+${c.start}/TB,scale=${Math.round(c.width)}:${Math.round(c.height)},setsar=1,fps=${p.fps}[v${i}]`,
        );
        filters.push(
          `[${last}][v${i}]overlay=x=${c.x}:y=${c.y}:enable='${enabled}':eof_action=pass:repeatlast=0[${next}]`,
        );
        if (
          !c.muted &&
          !p.layers?.[c.track]?.muted &&
          p.assets.find((a) => a.id === c.assetId)!.audio
        ) {
          const name = `a${i}`;
          filters.push(
            `[${i}:a]atrim=start=0:duration=${c.duration},asetpts=PTS-STARTPTS,volume=${c.volume ?? 1},adelay=${Math.round(c.start * 1000)}:all=1[${name}]`,
          );
          audio.push(`[${name}]`);
        }
      } else {
        const chain = boxes[c.id]
          .map(
            (b) =>
              `drawbox=x=${c.x + b.x}:y=${c.y + b.y}:w=${b.width}:h=${b.height}:color=0x${b.color.slice(1)}:t=fill:enable='${enabled}'`,
          )
          .join(",");
        filters.push(`[${last}]${chain || "null"}[${next}]`);
      }
      last = next;
    }
    if (audio.length)
      filters.push(
        `${audio.join("")}amix=inputs=${audio.length}:normalize=0,apad,atrim=duration=${duration}[audio]`,
      );
    const script = path.join(this.dir, `${id}.filters.txt`);
    fs.writeFileSync(
      script,
      filters.length ? filters.join(";\n") : `[0:v]null[out]`,
    );
    args.push(
      this.filterFileOption,
      script,
      "-map",
      filters.length ? `[${last}]` : "[out]",
    );
    if (audio.length)
      args.push("-map", "[audio]", "-c:a", "aac", "-b:a", "128k");
    const artifact = `.editor/jobs/${id}.mp4`;
    args.push(
      "-t",
      String(duration),
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
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:1",
      path.join(this.root, artifact),
    );
    const job: Job = {
      ...createRenderJob({
        revision: p.revision,
        engine: manifest.engine,
        inputManifest: manifest,
      }),
      id,
      progress: 0,
      log: "",
    };
    this.jobs.push(job);
    atomic(path.join(this.dir, `${id}.input.json`), p);
    const child = spawn(process.env.FFMPEG || "ffmpeg", args, {
      cwd: this.root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.processes.set(id, child);
    this.save(job);
    child.stderr?.on("data", (d) => {
      job.log = (job.log + d.toString()).slice(-16000);
    });
    child.stdout?.on("data", (d) => {
      const m = d.toString().match(/out_time_us=(\d+)/);
      if (m) {
        job.progress = Math.min(1, Number(m[1]) / 1e6 / duration);
        this.changed();
      }
    });
    child.on("error", (e) => {
      job.status = "failed";
      job.error = e.message;
      this.save(job);
    });
    child.on("close", (code) => {
      this.processes.delete(id);
      if (job.status === "running") {
        job.status = code === 0 ? "complete" : "failed";
        if (code === 0) {
          job.artifact = artifact;
          job.progress = 1;
        } else job.error = `FFmpeg exited ${code}. ${job.log.slice(-1500)}`;
      }
      this.save(job);
    });
    return job;
  }
  cancel(id: string) {
    const job = this.jobs.find((j) => j.id === id),
      p = this.processes.get(id);
    if (!job || !p) throw Error("No running job");
    requestCancellation(job);
    job.status = "cancelled";
    p.kill("SIGTERM");
    this.save(job);
  }
  close() {
    for (const [id, p] of this.processes) {
      const job = this.jobs.find((j) => j.id === id)!;
      job.status = "interrupted";
      p.kill("SIGTERM");
      this.save(job);
    }
  }
}
