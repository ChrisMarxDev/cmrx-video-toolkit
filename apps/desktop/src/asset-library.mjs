import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "yaml";
const image = /\.(png|jpe?g|webp|gif|bmp|svg)$/i,
  video = /\.(mp4|mov|webm|m4v)$/i,
  audio = /\.(wav|mp3|ogg|m4a|flac|aac)$/i;
const kind = (name) =>
  image.test(name)
    ? "image"
    : video.test(name)
      ? "video"
      : audio.test(name)
        ? "audio"
        : "file";
const str = (v, fallback = "", max = 2048) =>
  typeof v === "string" ? v.slice(0, max) : fallback;
export class AssetLibrary {
  constructor({ workspace, root, trash }) {
    this.workspace = workspace;
    this.profile = root;
    this.trash = trash;
    this.settingsFile = path.join(root, "asset-library.json");
    fs.mkdirSync(root, { recursive: true });
    this.library = path.join(root, "asset-library");
    let configured = false;
    try {
      const folder = JSON.parse(fs.readFileSync(this.settingsFile)).folder;
      if (typeof folder === "string" && path.isAbsolute(folder)) {
        this.library = folder;
        configured = true;
      }
    } catch {}
    if (!configured) fs.mkdirSync(this.library, { recursive: true });
    fs.mkdirSync(path.join(workspace, "assets"), { recursive: true });
  }
  loadNames() {
    try {
      this.names = new Map(
        JSON.parse(
          fs.readFileSync(
            path.join(this.workspace, ".editor/imported-assets.json"),
          ),
        ).map((a) => [a.path, a.name]),
      );
    } catch {
      this.names = new Map();
    }
  }
  settings() {
    this.refreshFolder();
    return {
      folder: this.library,
      projectFolder: path.join(this.workspace, "assets"),
      offline: !fs.existsSync(this.library),
    };
  }
  setFolder(folder) {
    const real = fs.realpathSync(folder);
    if (!fs.statSync(real).isDirectory()) throw Error("Choose a folder");
    this.library = real;
    fs.writeFileSync(this.settingsFile, JSON.stringify({ folder: real }), {
      mode: 0o600,
    });
    return this.settings();
  }
  root(scope) {
    this.refreshFolder();
    if (!["library", "project"].includes(scope))
      throw Error("Unknown asset location");
    const root =
      scope === "library" ? this.library : path.join(this.workspace, "assets");
    if (fs.lstatSync(root).isSymbolicLink())
      throw Error("Asset root cannot be a symlink");
    return fs.realpathSync(root);
  }
  refreshFolder() {
    try {
      const folder = JSON.parse(fs.readFileSync(this.settingsFile)).folder;
      if (typeof folder === "string" && path.isAbsolute(folder))
        this.library = folder;
    } catch {}
  }
  file(scope, relative = "") {
    if (
      typeof relative !== "string" ||
      relative.includes("\\") ||
      path.isAbsolute(relative) ||
      relative.split("/").some((p) => p === ".." || p.startsWith("."))
    )
      throw Error("Use a relative asset path");
    const root = this.root(scope);
    let p = root;
    for (const part of relative.split("/").filter(Boolean)) {
      p = path.join(p, part);
      if (fs.lstatSync(p).isSymbolicLink())
        throw Error("Asset symlinks are not supported");
    }
    const real = fs.realpathSync(p);
    if (real !== root && !real.startsWith(root + path.sep))
      throw Error("Asset is outside its folder");
    return real;
  }
  text(file, max = 64000) {
    if (!fs.statSync(file).isFile() || fs.statSync(file).size > max)
      throw Error("Asset metadata is too large");
    return fs.readFileSync(file, "utf8");
  }
  describe(scope, relative) {
    const file = this.file(scope, relative),
      stat = fs.statSync(file),
      base = {
        scope,
        path: relative,
        name: path.basename(file),
        type: kind(file),
        description: "",
        tags: [],
        bundle: false,
      };
    if (!stat.isDirectory())
      return {
        ...base,
        name:
          scope === "project"
            ? this.names?.get("assets/" + relative) || base.name
            : base.name,
        preview:
          base.type === "file" || !stat.size
            ? null
            : { file: relative, type: base.type },
        error:
          !stat.size && base.type !== "file"
            ? "Preview file is empty"
            : undefined,
      };
    if (!fs.existsSync(path.join(file, "assetconfig.yaml")))
      return { ...base, type: "folder", folder: true };
    base.bundle = true;
    base.type = "component";
    try {
      const config = parse(
        this.text(this.file(scope, relative + "/assetconfig.yaml")),
      );
      if (!config || typeof config !== "object" || Array.isArray(config))
        throw Error("Expected an asset configuration");
      base.name = str(config.name, base.name, 150);
      base.type = str(config.type, "component", 80);
      base.description = str(config.description);
      base.tags = Array.isArray(config.tags)
        ? config.tags
            .filter((t) => typeof t === "string")
            .slice(0, 50)
            .map((t) => t.slice(0, 100))
        : [];
      base.source = str(config.source, "", 1000);
      base.license = str(config.license, "Unknown", 500);
      const instructions = config.instructions ?? "SKILL.md";
      if (typeof instructions !== "string")
        throw Error("instructions must name a file");
      try {
        const ref = relative + "/" + instructions;
        this.text(this.file(scope, ref));
        base.instructionsPath = ref;
      } catch (e) {
        base.instructionError = e.message;
      }
      if (config.preview) {
        const type =
          config.preview.type === "sound" ? "audio" : config.preview.type;
        if (
          !["image", "video", "audio"].includes(type) ||
          typeof config.preview.file !== "string"
        )
          throw Error("Preview needs an image, video or audio file");
        const ref = relative + "/" + config.preview.file;
        const preview = this.file(scope, ref);
        if (
          kind(preview) !== type ||
          !fs.statSync(preview).isFile() ||
          !fs.statSync(preview).size
        )
          throw Error("Preview format does not match its type");
        base.preview = { file: ref, type };
      }
    } catch (e) {
      base.error = e.message;
    }
    return base;
  }
  list({ scope = "library", folder = "", query = "", type = "" } = {}) {
    this.loadNames();
    let root;
    try {
      root = this.file(scope, folder);
    } catch (e) {
      if (
        !fs.existsSync(
          scope === "library"
            ? this.library
            : path.join(this.workspace, "assets"),
        )
      )
        return { items: [], offline: true };
      throw e;
    }
    if (!fs.statSync(root).isDirectory()) throw Error("Choose an asset folder");
    const items = [];
    let visited = 0;
    const q = str(query).toLowerCase();
    const walk = (relative, depth) => {
      if (depth > 16) return;
      for (const entry of fs.readdirSync(this.file(scope, relative), {
        withFileTypes: true,
      })) {
        if (
          entry.name.startsWith(".") ||
          entry.isSymbolicLink() ||
          ++visited > 10000
        )
          continue;
        const p = [relative, entry.name].filter(Boolean).join("/");
        let item;
        try {
          item = this.describe(scope, p);
        } catch (e) {
          item = {
            scope,
            path: p,
            name: entry.name,
            type: "file",
            error: e.message,
          };
        }
        const match =
          !q ||
          q === "*" ||
          [item.name, item.description, ...(item.tags || [])]
            .join(" ")
            .toLowerCase()
            .includes(q);
        if (match && (!type || item.type === type) && items.length < 1000)
          items.push(item);
        if (q && item.folder) walk(p, depth + 1);
      }
    };
    walk(folder, 0);
    return {
      items,
      offline: false,
      truncated: visited > 10000 || items.length >= 1000,
    };
  }
  preview(scope, relative) {
    const item = this.describe(scope, relative);
    if (!item.preview) throw Error(item.error || "No preview available");
    return {
      file: this.file(scope, item.preview.file),
      type: item.preview.type,
    };
  }
  inspect(scope, relative) {
    this.loadNames();
    const item = this.describe(scope, relative);
    return {
      ...item,
      workspacePath: scope === "project" ? "assets/" + relative : undefined,
      instructionFile:
        scope === "project" && item.instructionsPath
          ? "assets/" + item.instructionsPath
          : undefined,
      instructions: item.instructionsPath
        ? this.text(this.file(scope, item.instructionsPath))
        : null,
    };
  }
  async copy(scope, relative, destination) {
    const item = this.inspect(scope, relative);
    if (item.folder) throw Error("Choose a file or configured asset bundle");
    const source = this.file(scope, relative),
      targetRoot = this.root(destination);
    const parent =
      destination === "project" ? path.join(targetRoot, "library") : targetRoot;
    if (
      fs.statSync(source).isDirectory() &&
      (parent === source || parent.startsWith(source + path.sep))
    )
      throw Error("Asset contains its destination folder");
    if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink())
      throw Error("Destination cannot be a symlink");
    fs.mkdirSync(parent, { recursive: true });
    let name = path.basename(source),
      target = path.join(parent, name),
      n = 2;
    while (fs.existsSync(target)) {
      const ext = item.bundle ? "" : path.extname(name);
      target = path.join(
        parent,
        (ext ? name.slice(0, -ext.length) : name) + ` (${n++})` + ext,
      );
    }
    const temporary = path.join(parent, ".copy-" + randomUUID());
    let bytes = 0,
      count = 0;
    const copy = (from, to) => {
      const st = fs.lstatSync(from);
      if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory()))
        throw Error("Bundles must contain regular files and folders");
      if (++count > 20000) throw Error("Asset has too many files");
      if (st.isDirectory()) {
        fs.mkdirSync(to);
        for (const name of fs.readdirSync(from))
          copy(path.join(from, name), path.join(to, name));
      } else {
        bytes += st.size;
        if (bytes > 2 * 1024 ** 3) throw Error("Asset exceeds 2 GB");
        fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
      }
    };
    try {
      copy(source, temporary);
      fs.renameSync(temporary, target);
    } catch (e) {
      fs.rmSync(temporary, { recursive: true, force: true });
      throw e;
    }
    const copied = this.inspect(
      destination,
      path.relative(targetRoot, target).split(path.sep).join("/"),
    );
    return {
      ...copied,
      origin: { scope, path: relative },
      workspacePath:
        destination === "project" ? "assets/" + copied.path : undefined,
    };
  }
  async use(ref) {
    if (ref.scope === "library")
      return this.copy("library", ref.path, "project");
    const item = this.inspect("project", ref.path);
    if (item.folder) throw Error("Choose an asset, not a collection");
    return { ...item, workspacePath: "assets/" + item.path };
  }
  async promote(relative) {
    return this.copy("project", relative, "library");
  }
  async remove(scope, relative) {
    if (!relative) throw Error("Cannot remove an asset root");
    const source = this.file(scope, relative);
    if (this.trash) await this.trash(source);
    else {
      const trash = path.join(this.profile, "asset-trash");
      fs.mkdirSync(trash, { recursive: true });
      await fs.promises.rename(
        source,
        path.join(trash, randomUUID() + "-" + path.basename(source)),
      );
    }
    return { trashed: true };
  }
}
