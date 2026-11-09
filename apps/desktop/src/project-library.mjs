import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

export class ProjectLibrary {
  constructor(root = path.join(os.homedir(), ".local/share/cmrx-chat-editor")) {
    this.file = path.join(root, "projects.json");
    try {
      this.items = JSON.parse(fs.readFileSync(this.file));
    } catch {
      this.items = [];
    }
    if (!Array.isArray(this.items)) this.items = [];
  }
  list() {
    return this.items
      .filter((p) => fs.existsSync(path.join(p.workspace, "project.json")))
      .slice(0, 6);
  }
  open(folder) {
    if (path.basename(folder) === ".cmrx-editor") folder = path.dirname(folder);
    const real = fs.realpathSync(folder);
    if (!fs.statSync(real).isDirectory())
      throw Error("Choose a folder for your project");
    let legacy = false;
    try {
      legacy =
        fs.existsSync(path.join(real, ".editor")) &&
        JSON.parse(fs.readFileSync(path.join(real, "project.json")))
          .schemaVersion === 1;
    } catch {}
    const workspace = legacy ? real : path.join(real, ".cmrx-editor");
    fs.mkdirSync(workspace, { recursive: true });
    fs.accessSync(workspace, fs.constants.W_OK);
    const existing = this.items.find((p) => p.folder === real);
    const project = {
      id: existing?.id || randomUUID(),
      folder: real,
      workspace,
      name: this.name(workspace, path.basename(real)),
      openedAt: new Date().toISOString(),
    };
    this.items = [
      project,
      ...this.items.filter((p) => p.folder !== real),
    ].slice(0, 20);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.items), {
      mode: 0o600,
    });
    fs.renameSync(this.file + ".tmp", this.file);
    return project;
  }
  recent(id) {
    const p = this.list().find((p) => p.id === id);
    if (!p) throw Error("This project folder is no longer available");
    return this.open(p.folder);
  }
  name(workspace, fallback) {
    try {
      return (
        JSON.parse(fs.readFileSync(path.join(workspace, "project-name.json")))
          .name || fallback
      );
    } catch {
      return fallback;
    }
  }
  rename(project, name) {
    name = this.validName(name);
    fs.writeFileSync(
      path.join(project.workspace, "project-name.json"),
      JSON.stringify({ name }),
      { mode: 0o600 },
    );
    return this.open(project.folder);
  }
  validName(name) {
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 100 ||
      /[\\/\x00-\x1f]/.test(name) ||
      [".", ".."].includes(name.trim())
    )
      throw Error("Enter a project name without slashes.");
    return name.trim();
  }
  create(parent, name) {
    name = this.validName(name);
    fs.mkdirSync(parent, { recursive: true });
    let folder = path.join(parent, name),
      n = 2;
    while (fs.existsSync(folder)) folder = path.join(parent, name + " " + n++);
    fs.mkdirSync(folder);
    return this.open(folder);
  }
}
