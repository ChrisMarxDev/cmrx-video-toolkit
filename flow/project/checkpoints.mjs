import { documentKey } from "./time.mjs";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
const roots = [
  "lib",
  "shaders",
  "tools",
  "skills",
  "test",
  "assets",
  "pubspec.yaml",
  "script.md",
  "AGENTS.md",
  "memory.md",
  "README.md",
  "design.md",
  "design-system",
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const mediaHashes = new Map();
function hashFile(file) {
  const keyOf = () => {
    const s = fs.statSync(file, { bigint: true });
    return [file, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(":");
  };
  const key = keyOf();
  if (mediaHashes.has(key)) return mediaHashes.get(key);
  const hash = createHash("sha256"),
    buffer = Buffer.allocUnsafe(1024 * 1024),
    fd = fs.openSync(file, "r");
  try {
    let n;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)))
      hash.update(buffer.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  if (keyOf() !== key) throw Error("Media changed while capturing checkpoint");
  const value = hash.digest("hex");
  if (mediaHashes.size > 1000) mediaHashes.clear();
  mediaHashes.set(key, value);
  return value;
}
function safe(root, relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes("\\") ||
    relative
      .split("/")
      .some((s) => !s || s === "." || s === ".." || s.startsWith(".")) ||
    !roots.some((r) => relative === r || relative.startsWith(r + "/"))
  )
    throw Error("Unsafe checkpoint source path");
  let parent = root;
  for (const part of relative.split("/")) {
    parent = path.join(parent, part);
    if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink())
      throw Error("Checkpoint symlinks are unsupported");
  }
  return parent;
}
const immutableMedia = (f) =>
  f.startsWith("assets/") &&
  /\.(mp4|mov|m4v|mkv|webm|avi|wav|mp3|aac|m4a|flac|ogg)$/i.test(f);
function sources(root, includeMedia = false) {
  const list = [];
  function walk(relative) {
    const full = safe(root, relative);
    if (!fs.existsSync(full)) return;
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(full)) {
        if (name.startsWith(".")) continue;
        walk(relative + "/" + name);
      }
    } else if (stat.isFile()) {
      if (includeMedia || !immutableMedia(relative)) list.push(relative);
    } else throw Error("Only regular source files can be checkpointed");
  }
  for (const r of roots) walk(r);
  return list.sort();
}
function write(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temp, bytes, { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
export class Checkpoints {
  constructor(root) {
    this.root = fs.realpathSync(root);
    const editor = path.join(this.root, ".editor");
    if (fs.existsSync(editor) && fs.lstatSync(editor).isSymbolicLink())
      throw Error("Unsafe checkpoint storage");
    this.dir = path.join(editor, "checkpoints");
    fs.mkdirSync(this.dir, { recursive: true });
    if (fs.lstatSync(this.dir).isSymbolicLink())
      throw Error("Unsafe checkpoint storage");
  }
  location(id) {
    if (typeof id !== "string" || !/^\w[\w-]{0,100}$/.test(id))
      throw Error("Invalid checkpoint ID");
    const dir = path.join(this.dir, id);
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink())
      throw Error("Unsafe checkpoint path");
    return dir;
  }
  read(id) {
    const dir = this.location(id),
      m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    if (
      m.schemaVersion !== 1 ||
      m.id !== id ||
      !Array.isArray(m.files) ||
      !Array.isArray(m.media)
    )
      throw Error("Invalid checkpoint manifest");
    return m;
  }
  list() {
    return fs
      .readdirSync(this.dir)
      .flatMap((id) => {
        try {
          const m = this.read(id);
          return [
            {
              id: m.id,
              label: m.label,
              createdAt: m.createdAt,
              revision: m.project.revision,
              files: m.files.length,
            },
          ];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  create(project, label = "Checkpoint") {
    if (typeof label !== "string" || label.length > 200)
      throw Error("Invalid checkpoint label");
    const id = randomUUID(),
      dir = this.location(id);
    fs.mkdirSync(dir);
    const files = [];
    let bytes = 0;
    try {
      for (const relative of sources(this.root)) {
        const data = fs.readFileSync(safe(this.root, relative));
        bytes += data.length;
        if (bytes > 512 * 1024 ** 2)
          throw Error(
            "Checkpoint sources exceed 512 MB; keep large recordings under media/",
          );
        write(path.join(dir, "files", relative), data);
        files.push({ path: relative, sha256: sha(data) });
      }
      const media = (project.assets ?? [])
        .flatMap((a) => [
          { id: a.id, path: a.path },
          ...(a.media?.original?.path && a.media.original.path !== a.path
            ? [{ id: a.id + ":original", path: a.media.original.path }]
            : []),
        ])
        .concat(
          sources(this.root, true)
            .filter(immutableMedia)
            .map((f) => ({ id: "file:" + f, path: f })),
        )
        .filter((a, i, all) => all.findIndex((b) => b.path === a.path) === i)
        .map((a) => {
          const full = path.resolve(this.root, a.path);
          if (!fs.realpathSync(full).startsWith(this.root + path.sep))
            throw Error("Media escapes project");
          return {
            assetId: a.id,
            path: a.path,
            sha256: hashFile(full),
          };
        });
      const manifest = {
        schemaVersion: 1,
        id,
        label,
        createdAt: new Date().toISOString(),
        project: structuredClone(project),
        files,
        media,
      };
      write(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
      return { id, label, revision: project.revision, files: files.length };
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  }
  diff(id, current) {
    const m = this.read(id),
      now = new Map(
        sources(this.root).map((f) => [
          f,
          sha(fs.readFileSync(safe(this.root, f))),
        ]),
      );
    return {
      id,
      label: m.label,
      baseRevision: current.revision,
      documentChanged:
        JSON.stringify({ ...current, revision: 0 }) !==
        JSON.stringify({ ...m.project, revision: 0 }),
      changed: m.files
        .filter((f) => now.get(f.path) !== f.sha256)
        .map((f) => f.path),
      removed: [...now.keys()].filter(
        (f) => !m.files.some((x) => x.path === f),
      ),
      media: m.media.map((a) => {
        let valid = false;
        try {
          const full = fs.realpathSync(path.resolve(this.root, a.path));
          valid =
            full.startsWith(this.root + path.sep) &&
            hashFile(full) === a.sha256;
        } catch {}
        return { ...a, valid };
      }),
    };
  }
  recover(current) {
    const journal = path.join(this.dir, "restore.json");
    if (!fs.existsSync(journal)) return null;
    const state = JSON.parse(fs.readFileSync(journal, "utf8")),
      target = this.read(state.target),
      safety = this.read(state.safety);
    if (!(
      current.revision > (state.baseRevision ?? safety.project.revision) &&
      documentKey(current) === documentKey(target.project)
    )) {
      if (documentKey(current) !== documentKey(safety.project))
        throw Error(
          "Interrupted checkpoint restore conflicts with newer work. Inspect safety checkpoint " +
            state.safety,
        );
      const data = safety.files.map((f) => {
        const source = path.join(this.location(safety.id), "files", f.path);
        safe(this.root, f.path);
        const b = fs.readFileSync(source);
        if (sha(b) !== f.sha256)
          throw Error("Recovery checkpoint integrity failed");
        return [f.path, b];
      });
      for (const f of sources(this.root))
        if (!safety.files.some((s) => s.path === f))
          fs.unlinkSync(safe(this.root, f));
      for (const [f, b] of data) write(safe(this.root, f), b);
    }
    fs.unlinkSync(journal);
    return { recovered: true, safetyCheckpoint: safety.id };
  }
  async restore(
    id,
    { baseRevision, current, apply, readCurrent, injectFailure } = {},
  ) {
    if (current.revision !== baseRevision)
      throw Error("Checkpoint revision conflict");
    const m = this.read(id),
      diff = this.diff(id, current);
    if (diff.media.some((a) => !a.valid))
      throw Error(
        "Checkpoint media missing or changed; restore/relink the original media first",
      );
    const data = new Map(
      m.files.map((f) => {
        const source = path.join(this.location(id), "files", f.path);
        safe(this.root, f.path);
        if (!fs.realpathSync(source).startsWith(this.location(id) + path.sep))
          throw Error("Unsafe checkpoint data");
        const b = fs.readFileSync(source);
        if (sha(b) !== f.sha256)
          throw Error("Checkpoint source integrity failed");
        return [f.path, b];
      }),
    );
    const safety = this.create(current, "Before restoring " + m.label),
      backup = new Map(
        sources(this.root).map((f) => [f, fs.readFileSync(safe(this.root, f))]),
      );
    const journal = path.join(this.dir, "restore.json");
    write(
      journal,
      JSON.stringify({
        schemaVersion: 1,
        target: id,
        safety: safety.id,
        baseRevision,
      }),
    );
    let applying = false;
    try {
      for (const [f, b] of data) write(safe(this.root, f), b);
      for (const f of diff.removed) fs.unlinkSync(safe(this.root, f));
      injectFailure?.();
      const project = structuredClone(m.project);
      project.revision = baseRevision;
      applying = true;
      const accepted = await apply(project, baseRevision);
      fs.rmSync(journal, { force: true });
      return { restored: id, safetyCheckpoint: safety.id, project: accepted };
    } catch (e) {
      // A lost HTTP reply is not proof of a rejected transaction. Keep the journal
      // if acceptance is uncertain; restart recovery reconciles it against the authority.
      if (applying && readCurrent) {
        const observed = await readCurrent();
        if (
          observed.revision > baseRevision &&
          documentKey(observed) === documentKey(m.project)
        ) {
          fs.rmSync(journal, { force: true });
          return {
            restored: id,
            safetyCheckpoint: safety.id,
            project: observed,
            recovered: true,
          };
        }
        if (
          observed.revision !== baseRevision ||
          documentKey(observed) !== documentKey(current)
        )
          throw Error(
            "Checkpoint acceptance is uncertain; preserve the recovery journal and restart before editing",
          );
      }
      for (const f of sources(this.root))
        if (!backup.has(f)) fs.unlinkSync(safe(this.root, f));
      for (const [f, b] of backup) write(safe(this.root, f), b);
      fs.rmSync(journal, { force: true });
      throw e;
    }
  }
}
