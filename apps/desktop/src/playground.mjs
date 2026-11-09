import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { parse } from "yaml";
import {
  graphicsDispatcher,
  bindGraphicsComposition,
} from "./graphics-clips.mjs";
const templates = fileURLToPath(new URL("../templates/", import.meta.url));
const toolkit = fileURLToPath(new URL("../../../", import.meta.url));
const pin = "10e442c1bb469118516df3335547f85ec92155e6";
const sourceRoots = ["lib", "assets", "shaders", "test", "pubspec.yaml"];
const roots = [...sourceRoots, "tools", "skills", "script.md"];
function walk(root, prefix = "") {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((e) => {
    if (e.isSymbolicLink() || (!e.isFile() && !e.isDirectory()))
      throw Error("Only regular source files and directories are allowed");
    return e.isDirectory()
      ? walk(path.join(root, e.name), prefix + e.name + "/")
      : [prefix + e.name];
  });
}
export class Playground {
  constructor({ workspace, onChange = () => {}, skillRoot, renderQueue }) {
    this.renderQueue = renderQueue;
    this.skillRoot = skillRoot;
    this.workspace = workspace;
    this.onChange = onChange;
    this.processes = new Set();
    this.jobsDir = path.join(workspace, ".editor/playground");
    fs.mkdirSync(this.jobsDir, { recursive: true });
    this.receipts = path.join(this.jobsDir, "jobs.json");
    try {
      this.jobs = JSON.parse(fs.readFileSync(this.receipts));
    } catch {
      this.jobs = [];
    }
    for (const j of this.jobs)
      if (j.status === "running") {
        j.status = "interrupted";
        j.phase = "interrupted";
        j.error = "App closed during rendering. Render again when ready.";
      }
    fs.mkdirSync(path.join(workspace, "lib"), { recursive: true });
    for (const f of ["composition.dart", "graphics.dart", "prepare.dart"])
      if (!fs.existsSync(path.join(workspace, "lib", f)))
        fs.copyFileSync(
          path.join(templates, f),
          path.join(workspace, "lib", f),
        );
    const fluvie = "/runtime/fluvie/packages/";
    const spec = {
      name: "video_playground",
      publish_to: "none",
      environment: { sdk: ">=3.12.0 <4.0.0" },
      dependencies: {
        flutter: { sdk: "flutter" },
        video_components: { path: "/toolkit/components" },
        fluvie: { path: fluvie + "fluvie" },
      },
      dependency_overrides: {
        fluvie: { path: fluvie + "fluvie" },
        fluvie_media: { path: fluvie + "fluvie_media" },
      },
      dev_dependencies: { flutter_test: { sdk: "flutter" } },
      flutter: { "uses-material-design": true },
    };
    if (!fs.existsSync(path.join(workspace, "pubspec.yaml")))
      fs.writeFileSync(
        path.join(workspace, "pubspec.yaml"),
        JSON.stringify(spec, null, 2),
      );
    this.persist();
  }
  files() {
    return roots.flatMap((r) => {
      const f = path.join(this.workspace, r);
      if (!fs.existsSync(f)) return [];
      const stat = fs.lstatSync(f);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
        throw Error("Only regular source files and directories are allowed");
      return stat.isDirectory() ? walk(f, r + "/") : [r];
    });
  }
  file(name, write = false) {
    if (typeof name === "string" && name.startsWith("lib/_cmrx_render/"))
      throw Error("lib/_cmrx_render is reserved for capture glue");
    if (
      typeof name !== "string" ||
      name.includes("\\") ||
      path.isAbsolute(name) ||
      name.split("/").some((p) => p === ".." || p.startsWith("."))
    )
      throw Error("Use a relative source path");
    if (!roots.some((r) => name === r || name.startsWith(r + "/"))) {
      if (!write && name === "project.json")
        return path.join(this.workspace, name);
      throw Error(
        "Source access is limited to lib, assets, shaders, test, pubspec.yaml, tools, skills and script.md. Edit media through editor_edit.",
      );
    }
    let current = this.workspace;
    for (const part of name.split("/")) {
      current = path.join(current, part);
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
        throw Error("Symlinks are not allowed");
    }
    return current;
  }
  read(name) {
    const f = this.file(name);
    if (fs.statSync(f).size > 200000) throw Error("File too large");
    return fs.readFileSync(f, "utf8");
  }
  write(name, content) {
    if (typeof content !== "string" || Buffer.byteLength(content) > 200000)
      throw Error("Source must be under 200KB");
    const f = this.file(name, true);
    const history = path.join(
      this.workspace,
      ".editor/source-history",
      randomUUID(),
    );
    fs.mkdirSync(history, { recursive: true });
    fs.writeFileSync(
      path.join(history, "change.json"),
      JSON.stringify({
        path: name,
        previous: fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null,
      }),
    );
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + "." + randomUUID() + ".tmp";
    const fd = fs.openSync(
      tmp,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    try {
      fs.writeFileSync(fd, content);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, f);
    this.onChange();
    return { path: name, saved: true };
  }
  fingerprint() {
    const h = createHash("sha256").update("graphics-preview-tracks-v3");
    for (const f of [
      "project.json",
      ...this.files()
        .filter((f) =>
          sourceRoots.some((r) => f === r || f.startsWith(r + "/")),
        )
        .sort(),
    ]) {
      h.update(f);
      h.update(fs.readFileSync(path.join(this.workspace, f)));
    }
    return h.digest("hex");
  }
  get running() {
    return this.jobs.some((j) => j.status === "running");
  }
  get blocking() {
    return this.jobs.some(
      (j) => j.status === "running" && j.kind !== "overlay",
    );
  }
  hasGraphics() {
    if (
      JSON.parse(
        fs.readFileSync(path.join(this.workspace, "project.json")),
      ).clips?.some((c) => c.kind === "graphics")
    )
      return true;
    return (
      this.read("lib/graphics.dart").trim() !==
      fs.readFileSync(path.join(templates, "graphics.dart"), "utf8").trim()
    );
  }
  state() {
    const latest = this.jobs
      .filter((j) => j.status === "complete" && j.kind !== "overlay")
      .at(-1);
    const overlay = this.jobs
      .filter((j) => j.status === "complete" && j.overlay)
      .at(-1);
    let fingerprint,
      sourceError,
      hasGraphics = true;
    try {
      fingerprint = this.fingerprint();
      hasGraphics = this.hasGraphics();
    } catch (e) {
      sourceError = e.message;
    }
    return {
      jobs: this.jobs,
      preview: latest
        ? { ...latest, stale: latest.fingerprint !== fingerprint }
        : null,
      running: this.running,
      sourceError,
      overlay:
        hasGraphics && overlay
          ? { ...overlay, stale: overlay.fingerprint !== fingerprint }
          : null,
    };
  }
  persist() {
    fs.writeFileSync(this.receipts + ".tmp", JSON.stringify(this.jobs));
    fs.renameSync(this.receipts + ".tmp", this.receipts);
    this.onChange();
  }
  async prepare() {
    if (this.preparation) return this.preparation;
    this.preparation = this.setup().catch((e) => {
      this.preparation = null;
      throw e;
    });
    return this.preparation;
  }
  async setup() {
    const sdk = fs.realpathSync(
      process.env.CHAT_FLUTTER_SDK ||
        path.dirname(
          path.dirname(
            execFileSync("which", ["flutter"], { encoding: "utf8" }).trim(),
          ),
        ),
    );
    const cache =
      process.env.PUB_CACHE || path.join(os.homedir(), ".pub-cache");
    const source = path.join(cache, "git", "fluvie-" + pin);
    if (
      !fs.existsSync(path.join(source, "packages/fluvie_cli/bin/fluvie.dart"))
    )
      throw Error(
        "Pinned Fluvie runtime is missing. This development MVP requires the toolkit toolchain.",
      );
    execFileSync("bwrap", ["--version"]);
    this.worker =
      process.env.CHAT_WORKER_ROOT ||
      path.join(
        os.homedir(),
        ".local/share/cmrx-chat-editor/workers",
        createHash("sha256").update(this.workspace).digest("hex").slice(0, 16),
      );
    fs.mkdirSync(this.worker, { recursive: true });
    // A worker owns its caches; generated code cannot alter the host SDK/cache.
    for (const [from, to] of [
      [sdk, "sdk"],
      [cache, "cache"],
      [source, "fluvie"],
    ]) {
      const dest = path.join(this.worker, to);
      if (!fs.existsSync(dest)) {
        const tmp = dest + ".copying";
        fs.rmSync(tmp, { recursive: true, force: true });
        await this.host("cp", ["-a", "--reflink=auto", from, tmp]);
        fs.renameSync(tmp, dest);
      }
    }
    await this.execRaw(
      ["dart", "pub", "get", "--offline"],
      this.workspace,
      "/sdk/packages/flutter_tools",
      120000,
    );
    await this.execRaw(
      ["flutter", "pub", "get", "--offline"],
      this.workspace,
      "/runtime/fluvie",
      120000,
    );
    await this.execRaw(
      ["flutter", "pub", "get", "--offline"],
      this.workspace,
      "/work",
      120000,
    );
    return { ready: true };
  }
  host(command, args, timeout = 300000) {
    return new Promise((resolve, reject) => {
      const p = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      this.processes.add(p);
      let output = "";
      const append = (d) => {
        output = (output + d).slice(-48000);
      };
      p.stdout.on("data", append);
      p.stderr.on("data", append);
      const timer = setTimeout(() => {
        try {
          process.kill(-p.pid, "SIGKILL");
        } catch {}
      }, timeout);
      p.on("error", reject);
      p.on("close", (code) => {
        clearTimeout(timer);
        this.processes.delete(p);
        code === 0
          ? resolve({ exitCode: code, output })
          : reject(Error(output || `Worker exited ${code}`));
      });
    });
  }
  execRaw(argv, work, cwd = "/work", timeout = 120000, readOnlySource = false) {
    const a = [
      "--unshare-all",
      "--die-with-parent",
      "--new-session",
      "--ro-bind",
      "/usr",
      "/usr",
      "--symlink",
      "usr/bin",
      "/bin",
      "--symlink",
      "usr/lib",
      "/lib",
      "--symlink",
      fs.existsSync("/usr/lib64") ? "usr/lib64" : "usr/lib",
      "/lib64",
      "--ro-bind",
      "/etc",
      "/etc",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--dir",
      "/home/worker",
      "--bind",
      path.join(this.worker, "sdk"),
      "/sdk",
      "--bind",
      path.join(this.worker, "cache"),
      "/cache",
      "--bind",
      path.join(this.worker, "fluvie"),
      "/runtime/fluvie",
      "--bind",
      work,
      "/work",
      "--ro-bind",
      toolkit,
      "/toolkit",
    ];
    a.push(
      "--ro-bind",
      fileURLToPath(new URL("../skills/", import.meta.url)),
      "/app-skills",
    );
    if (this.skillRoot && fs.existsSync(this.skillRoot))
      a.push("--ro-bind", this.skillRoot, "/skills");
    if (readOnlySource)
      for (const root of [
        ...roots,
        "overlay.dart",
        "cmrx_full_capture_test.dart",
        "cmrx_overlay_capture_test.dart",
        "timeline_thumbnails.dart",
        ...fs
          .readdirSync(work)
          .filter((f) =>
            /^(overlay_track_\d+|cmrx_overlay_track_\d+_capture_test)\.dart$/.test(
              f,
            ),
          ),
      ]) {
        const file = path.join(work, root);
        if (fs.existsSync(file)) a.push("--ro-bind", file, "/work/" + root);
      }
    if (fs.existsSync(path.join(this.workspace, "media")))
      a.push("--ro-bind", path.join(this.workspace, "media"), "/work/media");
    if (fs.existsSync(path.join(work, "project.json")))
      a.push(
        "--ro-bind",
        path.join(work, "project.json"),
        "/work/project.json",
      );
    // Hide application-owned receipts, sessions and capability tokens from generated code.
    a.push(
      "--tmpfs",
      "/work/.editor",
      "--remount-ro",
      "/work/.editor",
      "--clearenv",
      "--setenv",
      "HOME",
      "/home/worker",
      "--setenv",
      "PUB_CACHE",
      "/cache",
      "--setenv",
      "PATH",
      "/sdk/bin:/usr/bin",
      "--setenv",
      "LANG",
      "C.UTF-8",
      "--setenv",
      "CI",
      "true",
      "--setenv",
      "FLUTTER_SUPPRESS_ANALYTICS",
      "true",
      "--chdir",
      cwd,
      ...argv,
    );
    return this.host("bwrap", a, timeout);
  }
  async exec(argv) {
    if (
      !Array.isArray(argv) ||
      !argv.length ||
      argv.some((v) => typeof v !== "string") ||
      argv.join("").length > 16000
    )
      throw Error("argv must be an array of command arguments");
    if (this.running) throw Error("A render owns this worker");
    await this.prepare();
    return this.execRaw(argv, this.workspace);
  }
  async verifyTiming(snapshot, file, job) {
    const result = await this.execRaw(
      [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of",
        "json",
        "/work/" + file,
      ],
      snapshot,
      "/work",
      30000,
      true,
    );
    const media = JSON.parse(result.output),
      video = media.streams.find((s) => s.codec_type === "video");
    if (
      !Number.isFinite(Number(media.format.duration)) ||
      !video ||
      video.width !== job.width ||
      video.height !== job.height ||
      Math.abs(Number(media.format.duration) - job.duration) >
        Math.max(
          0.05,
          2 /
            JSON.parse(fs.readFileSync(path.join(snapshot, "project.json")))
              .fps,
        )
    )
      throw Error(
        `${file} does not match the timeline: expected ${job.duration}s at ${job.width}×${job.height}, got ${media.format.duration}s at ${video?.width}×${video?.height}. Use timeline clips to set timing; do not hardcode a different composition duration.`,
      );
  }
  async render(revision, { overlayOnly = false } = {}) {
    if (this.running) throw Error("Render already running");
    const project = JSON.parse(
      fs.readFileSync(path.join(this.workspace, "project.json")),
    );
    if (project.revision !== revision)
      throw Error("Revision conflict: read editor_context again");
    const packageName = parse(
      fs.readFileSync(path.join(this.workspace, "pubspec.yaml"), "utf8"),
    )?.name;
    if (
      typeof packageName !== "string" ||
      !/^[a-z][a-z0-9_]*$/.test(packageName)
    )
      throw Error("pubspec.yaml needs a valid Dart package name");
    const j = {
      id: randomUUID(),
      revision,
      kind: overlayOnly ? "overlay" : "export",
      width: project.width,
      height: project.height,
      duration: Math.max(1, ...project.clips.map((c) => c.start + c.duration)),
      status: "running",
      phase: "preparing",
      fingerprint: this.fingerprint(),
      createdAt: new Date().toISOString(),
    };
    const previewTracks = [
      ...new Set(
        project.clips.filter((c) => c.kind === "graphics").map((c) => c.track),
      ),
    ].sort((a, b) => a - b);
    if (
      previewTracks.some(
        (track) => !Number.isInteger(track) || track < 0 || track > 10000,
      )
    )
      throw Error("Invalid graphics preview track");
    const dest = path.join(this.jobsDir, j.id);
    fs.mkdirSync(path.join(dest, "lib"), { recursive: true });
    for (const f of ["project.json", ...this.files()]) {
      fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
      fs.copyFileSync(path.join(this.workspace, f), path.join(dest, f));
    }
    fs.writeFileSync(
      path.join(dest, "overlay.dart"),
      fs
        .readFileSync(path.join(templates, "overlay.dart"), "utf8")
        .replaceAll("__PROJECT_PACKAGE__", packageName),
    );
    fs.mkdirSync(path.join(dest, "lib/_cmrx_render"), { recursive: true });
    fs.writeFileSync(
      path.join(dest, "lib/_cmrx_render/graphics_stack.dart"),
      graphicsDispatcher(project, packageName),
    );
    const composition = path.join(dest, "lib/composition.dart");
    const bound = bindGraphicsComposition(
      fs.readFileSync(composition, "utf8"),
      packageName,
    );
    if (project.clips.some((c) => c.kind === "graphics") && !bound.bound)
      throw Error(
        "Composition must import graphics.dart and call buildGraphics to render timeline graphics",
      );
    fs.writeFileSync(composition, bound.source);
    const harness = fs.readFileSync(
      path.join(templates, "capture_test.dart"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dest, "timeline_thumbnails.dart"),
      fs
        .readFileSync(path.join(templates, "timeline_thumbnails.dart"), "utf8")
        .replaceAll("__PROJECT_PACKAGE__", packageName),
    );
    for (const [mode, target] of [
      ["full", `package:${packageName}/composition.dart`],
      ["overlay", "overlay.dart"],
    ])
      fs.writeFileSync(
        path.join(dest, `cmrx_${mode}_capture_test.dart`),
        harness
          .replace("__TARGET__", target)
          .replace("__CAPTURE_THUMBNAILS__", String(mode === "overlay"))
          .replaceAll("__PROJECT_PACKAGE__", packageName),
      );
    for (const track of previewTracks) {
      fs.writeFileSync(
        path.join(dest, `overlay_track_${track}.dart`),
        `import 'package:fluvie/fluvie.dart' show Video;\nimport 'overlay.dart' as base;\nFuture<Video> build() => base.build(previewTrack: ${track});\nvoid main() {}\n`,
      );
      fs.writeFileSync(
        path.join(dest, `cmrx_overlay_track_${track}_capture_test.dart`),
        harness
          .replace("__TARGET__", `overlay_track_${track}.dart`)
          .replace("__CAPTURE_THUMBNAILS__", "false")
          .replaceAll("__PROJECT_PACKAGE__", packageName),
      );
    }
    this.jobs.push(j);
    this.persist();
    // The job has an immutable source+manifest snapshot, independent of the chat turn.
    const stage = (phase, detail = {}) => {
      Object.assign(j, detail, {
        phase: j.cancelRequested ? "canceling" : phase,
      });
      this.persist();
    };
    this.renderTask = (async () => {
      let release;
      const controller = new AbortController();
      this.renderController = controller;
      try {
        if (this.renderQueue) {
          j.waitingForRender = true;
          stage("waiting");
          release = await this.renderQueue.acquire(controller.signal);
          j.waitingForRender = false;
          if (j.cancelRequested) throw Error("Canceled");
          stage("preparing");
        }
        await this.prepare();
        await this.execRaw(
          ["flutter", "pub", "get", "--offline"],
          dest,
          "/work",
          120000,
          true,
        );
        await this.execRaw(
          ["dart", "analyze", "lib"],
          dest,
          "/work",
          120000,
          true,
        );
        if (!overlayOnly) {
          stage("capturing");
          const out = await this.execRaw(
            [
              "dart",
              "run",
              "packages/fluvie_cli/bin/fluvie.dart",
              "render",
              "/work/lib/composition.dart",
              "--project",
              "/work",
              "--entry",
              "build",
              "--harness",
              "/work/cmrx_full_capture_test.dart",
              "--no-cache",
              "--out",
              "/work/preview.mp4",
              "--toolchain",
              "system",
              "--no-download",
              "--machine",
            ],
            dest,
            "/runtime/fluvie",
            600000,
            true,
          );
          if (j.cancelRequested) throw Error("Canceled");
          const artifact = fs.lstatSync(path.join(dest, "preview.mp4"));
          if (!artifact.isFile() || artifact.isSymbolicLink())
            throw Error("Renderer did not produce a regular video file");
          this.log(dest, out.output);
          stage("verifying");
          await this.verifyTiming(dest, "preview.mp4", j);
          j.artifact = true;
        }
        const renderAlpha = async (name, target, capture) => {
          stage("capturing");
          try {
            await this.execRaw(
              [
                "dart",
                "run",
                "packages/fluvie_cli/bin/fluvie.dart",
                "render",
                "/work/" + target,
                "--project",
                "/work",
                "--entry",
                "build",
                "--harness",
                "/work/" + capture,
                "--no-cache",
                "--out",
                "/work/" + name + ".webm",
                "--format",
                "transparent",
                "--toolchain",
                "system",
                "--no-download",
                "--machine",
              ],
              dest,
              "/runtime/fluvie",
              600000,
              true,
            );
          } catch (error) {
            // Fluvie10e442c compares VP9's default ffprobe pixel format to yuva420p.
            // FFmpeg's native VP9 decoder omits alpha; libvpx-vp9 decodes it correctly.
            const receipt = path.join(dest, name + ".failed.render.json");
            let verification;
            try {
              const stat = fs.lstatSync(receipt);
              if (
                stat.isFile() &&
                !stat.isSymbolicLink() &&
                stat.size < 2000000
              )
                verification = JSON.parse(
                  fs.readFileSync(receipt),
                ).verification;
            } catch {}
            const mismatch = verification?.mismatches;
            if (!(
              verification?.observed?.hasAlpha &&
              mismatch?.length === 1 &&
              mismatch[0].code === "pixelFormat" &&
              mismatch[0].expected === "yuva420p" &&
              mismatch[0].actual === "yuv420p"
            ))
              throw error;
            stage("verifying");
            // Do not waive verification: decode every alpha frame with the alpha-capable decoder.
            await this.execRaw(
              [
                "ffmpeg",
                "-v",
                "error",
                "-c:v",
                "libvpx-vp9",
                "-i",
                "/work/" + name + ".webm",
                "-vf",
                "alphaextract",
                "-f",
                "null",
                "-",
              ],
              dest,
              "/work",
              120000,
              true,
            );
          }

          if (j.cancelRequested) throw Error("Canceled");
          const overlay = fs.lstatSync(path.join(dest, name + ".webm"));
          if (!overlay.isFile() || overlay.isSymbolicLink())
            throw Error("Invalid graphics cache");
          stage("verifying");
          await this.verifyTiming(dest, name + ".webm", j);
        };
        await renderAlpha(
          "overlay",
          "overlay.dart",
          "cmrx_overlay_capture_test.dart",
        );
        for (const [trackIndex, track] of previewTracks.entries()) {
          stage("capturing", {
            track: trackIndex,
            trackCount: previewTracks.length,
          });
          if (j.cancelRequested) throw Error("Canceled");
          const name = `overlay_track_${track}`;
          if (previewTracks.length === 1 && !project.layers?.[track]?.disabled)
            fs.copyFileSync(
              path.join(dest, "overlay.webm"),
              path.join(dest, name + ".webm"),
            );
          else
            await renderAlpha(
              name,
              name + ".dart",
              `cmrx_${name}_capture_test.dart`,
            );
        }
        if (previewTracks.length) j.previewTracks = previewTracks;
        j.overlay = true;
        j.thumbnails =
          fs.existsSync(path.join(dest, "graphics-thumbnails.json")) &&
          fs.existsSync(path.join(dest, "graphics-thumbnails.png"));
        if (fs.existsSync(path.join(dest, "graphics-thumbnails-error.txt")))
          j.thumbnailError = fs
            .readFileSync(
              path.join(dest, "graphics-thumbnails-error.txt"),
              "utf8",
            )
            .slice(0, 1000);
        j.status = "complete";
        j.phase = "complete";
      } catch (e) {
        j.status = j.cancelRequested ? "canceled" : "failed";
        j.phase = j.status;
        j.waitingForRender = false;
        j.error = j.cancelRequested ? "Canceled by user" : e.message;
        this.log(dest, e.message);
      }
      release?.();
      this.renderController = null;
      this.persist();
    })();
    return { ...j };
  }
  log(dest, text) {
    try {
      const fd = fs.openSync(
        path.join(dest, "render.log"),
        fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_TRUNC |
          fs.constants.O_NOFOLLOW,
        0o600,
      );
      try {
        fs.writeFileSync(fd, text);
      } finally {
        fs.closeSync(fd);
      }
    } catch {}
  }
  overlayArtifact(id, track) {
    if (
      !this.jobs.some(
        (j) => j.id === id && j.status === "complete" && j.overlay,
      )
    )
      return null;
    const job = this.jobs.find((j) => j.id === id);
    let name = "overlay.webm";
    if (track !== undefined && track !== null) {
      if (
        !/^\d+$/.test(String(track)) ||
        !job.previewTracks?.includes(Number(track))
      )
        return null;
      name = `overlay_track_${Number(track)}.webm`;
    }
    const dir = path.join(this.jobsDir, id);
    if (path.dirname(dir) !== this.jobsDir) return null;
    try {
      const file = path.join(dir, name);
      if (fs.lstatSync(dir).isSymbolicLink()) return null;
      const stat = fs.lstatSync(file);
      return stat.isFile() && !stat.isSymbolicLink() ? file : null;
    } catch {
      return null;
    }
  }
  artifact(id) {
    if (
      !this.jobs.some(
        (j) => j.id === id && j.status === "complete" && j.kind !== "overlay",
      )
    )
      return null;
    return path.join(this.jobsDir, id, "preview.mp4");
  }
  cancel() {
    this.renderController?.abort();
    for (const j of this.jobs)
      if (j.status === "running") {
        j.cancelRequested = true;
        j.phase = "canceling";
      }
    this.persist();
    for (const p of this.processes)
      try {
        process.kill(-p.pid, "SIGTERM");
        setTimeout(() => {
          if (this.processes.has(p))
            try {
              process.kill(-p.pid, "SIGKILL");
            } catch {}
        }, 2000).unref();
      } catch {}
  }
  async close() {
    this.cancel();
    await this.renderTask;
  }
}
