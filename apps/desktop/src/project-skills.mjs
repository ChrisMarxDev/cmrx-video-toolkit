import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
const appSkills = fileURLToPath(new URL("../skills/", import.meta.url));
const toolkit = fileURLToPath(new URL("../../../.skills/", import.meta.url));
function within(root, file) {
  const lexicalRoot = path.resolve(root),
    lexicalFile = path.resolve(file);
  if (
    lexicalFile !== lexicalRoot &&
    !lexicalFile.startsWith(lexicalRoot + path.sep)
  )
    throw Error("File is outside this skill");
  const actual = fs.realpathSync(file),
    base = fs.realpathSync(root);
  if (actual !== base && !actual.startsWith(base + path.sep))
    throw Error("File is outside this skill");
  return actual;
}
export class ProjectSkills {
  constructor({ workspace, root, workspaceRoot }) {
    this.workspace = workspace;
    this.root = root;
    this.workspaceRoot = workspaceRoot;
    this.shared = workspaceRoot
      ? path.join(workspaceRoot, "skills")
      : path.join(root, "skills");
    fs.mkdirSync(path.join(workspace, "skills"), { recursive: true });
    fs.mkdirSync(this.shared, { recursive: true });
  }
  catalog() {
    const result = [];
    for (const [scope, root] of [
      ["app", appSkills],
      ["toolkit", toolkit],
      [this.workspaceRoot ? "workspace" : "installed", this.shared],
      ["project", path.join(this.workspace, "skills")],
    ]) {
      if (!fs.existsSync(root) || fs.lstatSync(root).isSymbolicLink()) continue;
      for (const e of fs.readdirSync(root, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        try {
          const f = within(root, path.join(root, e.name, "SKILL.md"));
          const text = fs.readFileSync(f, "utf8");
          if (text.length > 200000) continue;
          const meta =
            parse(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || "") || {};
          result.push({
            id: `${scope}/${e.name}`,
            name: String(meta.name || e.name),
            description: String(meta.description || ""),
            scope,
          });
        } catch {}
      }
    }
    return result;
  }
  read(id, file = "SKILL.md") {
    const entry = this.catalog().find((e) => e.id === id);
    if (!entry) throw Error("Skill not found");
    const [scope, name] = id.split("/");
    const root =
      scope === "app"
        ? appSkills
        : scope === "toolkit"
          ? toolkit
          : ["installed", "workspace"].includes(scope)
            ? this.shared
            : path.join(this.workspace, "skills");
    const dir = within(root, path.join(root, name));
    const target = within(dir, path.resolve(dir, file));
    if (fs.statSync(target).size > 200000) throw Error("Skill file too large");
    return {
      id,
      file,
      text: fs.readFileSync(target, "utf8"),
      workerPath:
        scope === "app"
          ? `/app-skills/${name}`
          : scope === "toolkit"
            ? `/toolkit/.skills/${name}`
            : ["installed", "workspace"].includes(scope)
              ? `/skills/${name}`
              : `/work/skills/${name}`,
    };
  }
  install(folder) {
    if (fs.lstatSync(this.shared).isSymbolicLink())
      throw Error("Skill library cannot be a symlink");
    const source = fs.realpathSync(folder),
      main = path.join(source, "SKILL.md");
    const text = fs.readFileSync(main, "utf8");
    const meta =
      parse(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || "") || {};
    const name = String(meta.name || path.basename(source));
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name))
      throw Error("Skill needs a simple name");
    const files = [];
    let bytes = 0;
    const visit = (dir, prefix = "") => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue;
        if (e.isSymbolicLink())
          throw Error("Skill folders cannot contain symlinks");
        const relative = prefix + e.name;
        if (e.isDirectory()) visit(path.join(dir, e.name), relative + "/");
        else if (e.isFile()) {
          bytes += fs.statSync(path.join(dir, e.name)).size;
          if (bytes > 20 * 1024 * 1024 || files.length > 1000)
            throw Error("Skill folder is too large");
          files.push(relative);
        }
      }
    };
    visit(source);
    const dest = path.join(this.shared, name);
    if (fs.existsSync(dest))
      throw Error("A skill with this name is already installed");
    fs.mkdirSync(dest);
    try {
      for (const f of files) {
        fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
        fs.copyFileSync(path.join(source, f), path.join(dest, f));
      }
    } catch (e) {
      fs.rmSync(dest, { recursive: true, force: true });
      throw e;
    }
    return name;
  }
  settings() {
    return {
      instructions: this.text("AGENTS.md"),
      workspaceInstructions: this.workspaceText(),
      workspaceFolder: this.workspaceRoot,
      memory: this.text("memory.md"),
      skills: this.catalog(),
    };
  }
  workspaceText() {
    if (!this.workspaceRoot) return "";
    const file = path.join(this.workspaceRoot, "AGENTS.md");
    if (!fs.existsSync(file)) return "";
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 100000)
      throw Error("Invalid workspace instructions");
    return fs.readFileSync(file, "utf8");
  }
  text(file) {
    if (!["AGENTS.md", "memory.md"].includes(file))
      throw Error("Invalid project notes");
    const p = path.join(this.workspace, file);
    if (!fs.existsSync(p)) return "";
    if (fs.lstatSync(p).isSymbolicLink() || fs.statSync(p).size > 100000)
      throw Error("Invalid project notes");
    return fs.readFileSync(p, "utf8");
  }
  write(file, text, scope = "project", expectedText) {
    if (
      !["AGENTS.md", "memory.md"].includes(file) ||
      typeof text !== "string" ||
      text.length > 100000
    )
      throw Error("Invalid project notes");
    if (
      scope !== "project" &&
      (scope !== "workspace" || file !== "AGENTS.md" || !this.workspaceRoot)
    )
      throw Error("Invalid note scope");
    const p = path.join(
      scope === "workspace" ? this.workspaceRoot : this.workspace,
      file,
    );
    if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink())
      throw Error("Symlinks are not allowed");
    if (
      scope === "workspace" &&
      expectedText !== undefined &&
      this.workspaceText() !== expectedText
    )
      throw Error(
        "Workspace instructions changed in another project. Reopen Settings before saving.",
      );
    const tmp = p + "." + Date.now() + ".tmp";
    fs.writeFileSync(tmp, text, { mode: 0o600, flag: "wx" });
    fs.renameSync(tmp, p);
    return { saved: true };
  }
}
