import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";

function directory(folder) {
  if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink())
    throw Error("Workspace folders cannot be symlinks");
  fs.mkdirSync(folder, { recursive: true });
  if (!fs.statSync(folder).isDirectory()) throw Error("Choose a directory");
}
export function workspaceFor(folder) {
  let at = path.resolve(folder);
  while (true) {
    if (fs.existsSync(path.join(at, "workspace.yaml")))
      return readWorkspace(at);
    const parent = path.dirname(at);
    if (parent === at) return null;
    at = parent;
  }
}
export function readWorkspace(folder) {
  const real = fs.realpathSync(folder),
    file = path.join(real, "workspace.yaml");
  if (fs.lstatSync(file).isSymbolicLink())
    throw Error("Workspace configuration cannot be a symlink");
  if (fs.statSync(file).size > 100000)
    throw Error("Workspace configuration is too large");
  const config = parse(fs.readFileSync(file, "utf8"));
  if (
    config?.schemaVersion !== 1 ||
    typeof config.name !== "string" ||
    !config.name.trim()
  )
    throw Error("Invalid workspace.yaml");
  for (const sub of ["projects", "assets", "skills"])
    directory(path.join(real, sub));
  return { folder: real, name: config.name };
}
export function createWorkspace(folder) {
  directory(folder);
  const file = path.join(folder, "workspace.yaml");
  if (!fs.existsSync(file))
    fs.writeFileSync(
      file,
      stringify({
        schemaVersion: 1,
        name: path.basename(path.resolve(folder)),
      }),
      { flag: "wx" },
    );
  const result = readWorkspace(folder);
  const instructions = path.join(result.folder, "AGENTS.md");
  if (!fs.existsSync(instructions))
    fs.writeFileSync(instructions, "# Workspace instructions\n\n", {
      flag: "wx",
    });
  const ignore = path.join(result.folder, ".gitignore");
  if (fs.existsSync(ignore) && fs.lstatSync(ignore).isSymbolicLink())
    throw Error("Workspace .gitignore cannot be a symlink");
  const existing = fs.existsSync(ignore) ? fs.readFileSync(ignore, "utf8") : "";
  const rules = [
    "**/.editor/",
    "**/.cmrx/",
    "**/.dart_tool/",
    "projects/*/build/",
    "projects/*/exports/",
    ".DS_Store",
    ".env",
    ".env.*",
    "!.env.example",
  ];
  const missing = rules.filter((r) => !existing.split(/\r?\n/).includes(r));
  if (missing.length)
    fs.appendFileSync(
      ignore,
      (existing && !existing.endsWith("\n") ? "\n" : "") +
        "\n# Local runtime and generated output; creative source stays portable.\n" +
        missing.join("\n") +
        "\n",
    );
  return result;
}
export class WorkspaceLibrary {
  constructor(profile, fallback) {
    this.file = path.join(profile, "workspace-selection.json");
    this.fallback = fallback;
    try {
      this.saved = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      this.saved = {};
    }
    this.current = null;
  }
  select(folder, { create = false } = {}) {
    const workspace = create ? createWorkspace(folder) : readWorkspace(folder);
    this.current = workspace;
    const recents = [
      workspace.folder,
      ...(this.saved.recents || []).filter((f) => f !== workspace.folder),
    ].slice(0, 12);
    this.saved = { folder: workspace.folder, recents };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.saved), {
      mode: 0o600,
    });
    fs.renameSync(this.file + ".tmp", this.file);
    return workspace;
  }
  ensure() {
    return this.current
      ? readWorkspace(this.current.folder)
      : this.select(this.saved.folder || this.fallback, {
          create: !this.saved.folder,
        });
  }
  list() {
    return (this.saved.recents || []).flatMap((folder) => {
      try {
        return [readWorkspace(folder)];
      } catch {
        return [];
      }
    });
  }
  projects() {
    if (!this.current) return [];
    try {
      readWorkspace(this.current.folder);
    } catch {
      return [];
    }
    return fs
      .readdirSync(path.join(this.current.folder, "projects"), {
        withFileTypes: true,
      })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        folder: path.join(this.current.folder, "projects", e.name),
      }));
  }
}
