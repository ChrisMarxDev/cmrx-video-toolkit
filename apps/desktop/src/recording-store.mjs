import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const kinds = new Set(["screen", "camera", "microphone"]);
function inside(root, file) {
  const r = path.relative(root, file);
  if (r === ".." || r.startsWith(".." + path.sep) || path.isAbsolute(r))
    throw Error("Recording path escaped the project");
}
function directory(root, relative) {
  let current = root;
  for (const segment of relative.split("/")) {
    if (!segment || segment === "." || segment === "..")
      throw Error("Invalid recording path");
    current = path.join(current, segment);
    if (fs.existsSync(current)) {
      if (
        fs.lstatSync(current).isSymbolicLink() ||
        !fs.statSync(current).isDirectory()
      )
        throw Error("Recording directories cannot be symlinks");
    } else fs.mkdirSync(current, { mode: 0o700 });
    inside(root, fs.realpathSync(current));
  }
  return current;
}

function atomic(folder, name, value) {
  const temp = path.join(folder, ".write-" + randomUUID());
  fs.writeFileSync(temp, value, { flag: "wx", mode: 0o600 });
  fs.renameSync(temp, path.join(folder, name));
}
export class RecordingStore {
  constructor(workspace) {
    this.workspace = fs.realpathSync(workspace);
    this.id =
      "recording-" +
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      randomUUID().slice(0, 8);
    this.folder = directory(this.workspace, ".editor/recordings/" + this.id);
    this.status = "setup";
    this.tracks = new Map();
  }
  persist() {
    atomic(
      this.folder,
      "manifest.json",
      JSON.stringify(
        {
          version: 1,
          ownerPid: process.pid,
          id: this.id,
          status: this.status,
          createdAt: this.createdAt,
          finishedAt: this.finishedAt,
          error: this.error,
          tracks: [...this.tracks.values()].map(
            ({ name, file, mime, offsetMs, bytes, media }) => ({
              name,
              file,
              mime,
              offsetMs,
              bytes,
              media,
            }),
          ),
        },
        null,
        2,
      ) + "\n",
    );
  }
  async start(spec) {
    if (this.status !== "setup") throw Error("Recording already started");
    if (
      !Array.isArray(spec) ||
      !spec.length ||
      spec.length > 3 ||
      new Set(spec.map((t) => t.name)).size !== spec.length
    )
      throw Error("Choose independent recording tracks");
    for (const t of spec)
      if (
        !kinds.has(t.name) ||
        typeof t.mime !== "string" ||
        !/^((video|audio)\/webm)(;.*)?$/.test(t.mime)
      )
        throw Error("Invalid recording track");
    this.createdAt = new Date().toISOString();
    this.status = "recording";
    try {
      for (const t of spec) {
        const file = t.name + (t.name === "microphone" ? ".weba" : ".webm");
        const handle = await fs.promises.open(
          path.join(this.folder, file + ".partial"),
          fs.constants.O_CREAT |
            fs.constants.O_EXCL |
            fs.constants.O_WRONLY |
            fs.constants.O_NOFOLLOW,
          0o600,
        );
        this.tracks.set(t.name, {
          name: t.name,
          file,
          mime: t.mime,
          offsetMs: 0,
          bytes: 0,
          handle,
          tail: Promise.resolve(),
        });
      }
      this.persist();
    } catch (e) {
      await this.interrupt(e.message);
      throw e;
    }
    return { id: this.id };
  }
  async write(name, data) {
    const track = this.tracks.get(name);
    if (this.status !== "recording" || !track)
      throw Error("Recording is not accepting this track");
    if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data))
      throw Error("Expected recording bytes");
    const bytes = Buffer.from(
      data.buffer || data,
      data.byteOffset || 0,
      data.byteLength,
    );
    if (!bytes.length || bytes.length > 16 * 1024 * 1024)
      throw Error("Invalid recording chunk size");
    track.tail = track.tail.then(async () => {
      await track.handle.writeFile(bytes);
      track.bytes += bytes.length;
    });
    return track.tail;
  }
  async closeTracks() {
    let failure;
    for (const t of this.tracks.values()) {
      await t.tail.catch(() => {});
      if (t.handle) {
        try {
          await t.handle.sync();
        } catch (e) {
          failure ||= e;
        }
        try {
          await t.handle.close();
        } catch (e) {
          failure ||= e;
        }
        t.handle = null;
      }
    }
    if (failure) throw failure;
  }
  async interrupt(reason = "Recording interrupted") {
    if (this.status === "complete") return;
    this.status = "interrupted";
    this.error = reason;
    try {
      await this.closeTracks();
    } finally {
      this.persist();
    }
  }
  async finish(offsets = {}) {
    if (this.status === "complete") return { folder: this.folder, id: this.id };
    if (!["recording", "interrupted"].includes(this.status))
      throw Error("No recording to save");
    this.status = "saving";
    this.persist();
    try {
      for (const t of this.tracks.values()) await t.tail;
      await this.closeTracks();
      for (const t of this.tracks.values()) {
        const offset = offsets[t.name] ?? t.offsetMs;
        if (!Number.isFinite(offset) || offset < 0 || offset > 60000)
          throw Error("Invalid recording timing");
        t.offsetMs = offset;
        if (!t.bytes) throw Error("No media received for " + t.name);
        const input = path.join(this.folder, t.file + ".partial"),
          output = path.join(this.folder, t.file);
        await run(
          process.env.FFMPEG || "ffmpeg",
          [
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-i",
            input,
            "-map",
            "0",
            "-c",
            "copy",
            "-f",
            "webm",
            output,
          ],
          { timeout: 120000, maxBuffer: 1024 * 1024 },
        );
        const { stdout } = await run(
          process.env.FFPROBE || "ffprobe",
          [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            output,
          ],
          { maxBuffer: 1024 * 1024 },
        );
        const p = JSON.parse(stdout),
          duration = Number(p.format.duration);
        if (
          !Number.isFinite(duration) ||
          duration <= 0 ||
          !p.streams.some(
            (s) =>
              s.codec_type === (t.name === "microphone" ? "audio" : "video"),
          )
        )
          throw Error(
            "Recording did not contain playable " + t.name + " media",
          );
        t.media = {
          duration,
          width: p.streams.find((s) => s.codec_type === "video")?.width,
          height: p.streams.find((s) => s.codec_type === "video")?.height,
        };
      }
      const primary =
        this.tracks.get("screen") ||
        this.tracks.get("camera") ||
        this.tracks.get("microphone");
      atomic(
        this.folder,
        "INSTRUCTIONS.md",
        "Uncomposited recording session. Read manifest.json before editing. Each track is a separate source; offsetMs is its approximate start relative to the same capture-session clock. Align tracks using those offsets and check audio/lip sync; this is not sample-accurate synchronization. Preserve originals. No timeline clips have been created.\n",
      );
      atomic(
        this.folder,
        "assetconfig.yaml",
        JSON.stringify(
          {
            name: "Recording " + this.createdAt.slice(0, 19).replace("T", " "),
            type: primary.name === "microphone" ? "audio" : "video",
            description:
              [...this.tracks.keys()].join(" + ") +
              " · separate editable sources",
            tags: ["recording", "showcase"],
            preview: {
              type: primary.name === "microphone" ? "audio" : "video",
              file: primary.file,
            },
            instructions: "INSTRUCTIONS.md",
          },
          null,
          2,
        ),
      );
      const published = directory(this.workspace, "assets/recordings");
      this.status = "complete";
      this.finishedAt = new Date().toISOString();
      this.error = undefined;
      this.persist();
      // Publish the whole bundle only after every stream has a playable container.
      const destination = path.join(published, this.id);
      if (fs.existsSync(destination))
        throw Error("Recording destination already exists");
      fs.renameSync(this.folder, destination);
      this.folder = destination;
      for (const t of this.tracks.values()) {
        try {
          fs.unlinkSync(path.join(this.folder, t.file + ".partial"));
        } catch {}
      }
      return {
        id: this.id,
        folder: this.folder,
        tracks: [...this.tracks.keys()],
      };
    } catch (e) {
      this.status = "interrupted";
      this.error = e.message;
      try {
        this.persist();
      } catch {}
      throw Error(
        "Could not finish saving. Capture files are retained in " +
          this.folder +
          ". " +
          e.message,
      );
    }
  }
}

// Reconcile only this feature's private staging folders; never delete partial media.
export function recoverRecordings(workspace) {
  const root = fs.realpathSync(workspace),
    stage = path.join(root, ".editor/recordings");
  if (!fs.existsSync(stage)) return [];
  inside(root, fs.realpathSync(stage));
  const retained = [];
  for (const name of fs.readdirSync(stage)) {
    if (!/^recording-/.test(name)) continue;
    const folder = path.join(stage, name);
    if (
      fs.lstatSync(folder).isSymbolicLink() ||
      !fs.statSync(folder).isDirectory()
    )
      continue;
    try {
      const file = path.join(folder, "manifest.json");
      if (fs.lstatSync(file).isSymbolicLink()) continue;
      const m = JSON.parse(fs.readFileSync(file, "utf8"));
      if (m.status === "complete") continue;
      if (["recording", "saving"].includes(m.status)) {
        if (Number.isSafeInteger(m.ownerPid) && m.ownerPid > 0) {
          try {
            process.kill(m.ownerPid, 0);
            continue;
          } catch (e) {
            if (e.code !== "ESRCH") continue;
          }
        }
        m.status = "interrupted";
        m.error = "Previous recorder stopped unexpectedly";
        atomic(folder, "manifest.json", JSON.stringify(m, null, 2) + "\n");
      }
      if (m.status === "interrupted") retained.push(name);
    } catch {}
  }
  return retained;
}
