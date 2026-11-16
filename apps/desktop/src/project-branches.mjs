import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { branchProject } from "../../../flow/project/branch.mjs";
import { validate } from "../../local-editor/dist/model.mjs";
import { readWorkspace, workspaceFor } from "./workspace-library.mjs";
const roots = [
  "lib",
  "assets",
  "media",
  "shaders",
  "test",
  "tools",
  "skills",
  "pubspec.yaml",
  "pubspec.lock",
  "context",
];
function files(root) {
  const result = [];
  function walk(relative) {
    const full = path.join(root, relative);
    if (!fs.existsSync(full)) return;
    const s = fs.lstatSync(full);
    if (s.isSymbolicLink())
      throw Error("Project sources/media cannot contain symlinks");
    if (s.isDirectory()) {
      for (const n of fs.readdirSync(full)) {
        if (n.startsWith(".")) continue;
        walk(relative + "/" + n);
      }
    } else if (s.isFile()) result.push(relative);
    else throw Error("Only regular project files can be copied");
  }
  for (const r of roots) walk(r);
  return result.sort();
}
const ordered = (v) =>
  Array.isArray(v)
    ? v.map(ordered)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, ordered(v[k])]),
        )
      : v;
function atomic(file, value) {
  const temp = file + "." + randomUUID() + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  fs.renameSync(temp, file);
}
export class ProjectBranches {
  constructor({
    workspace,
    workspaceRoot,
    editor,
    openProject,
    onProgress = () => {},
  }) {
    this.workspace = fs.realpathSync(workspace);
    this.root = workspaceRoot;
    this.editor = editor;
    this.openProject = openProject;
    this.onProgress = onProgress;
  }
  owner() {
    const folder = this.root ?? workspaceFor(this.workspace)?.folder;
    if (!folder)
      throw Error(
        "Choose a workspace in the desktop app before creating sibling projects",
      );
    return readWorkspace(folder);
  }
  list() {
    const owner = this.owner(),
      parent = path.join(owner.folder, "projects");
    return {
      workspace: owner.name,
      projects: fs
        .readdirSync(parent, { withFileTypes: true })
        .filter(
          (e) =>
            e.isDirectory() &&
            !e.name.startsWith(".") &&
            (fs.existsSync(path.join(parent, e.name, "project.json")) ||
              fs.existsSync(
                path.join(parent, e.name, ".cmrx-editor/project.json"),
              )),
        )
        .map((e) => ({ name: e.name, folder: "projects/" + e.name })),
    };
  }
  async open(name) {
    if (
      typeof name !== "string" ||
      !this.list().projects.some((p) => p.name === name)
    )
      throw Error("Choose an existing project from workspace_projects");
    if (!this.openProject)
      throw Error("Project is saved; open it from the desktop + menu");
    await this.openProject(path.join(this.owner().folder, "projects", name));
    return { opened: name };
  }
  async create({ revision, requestId, projects }) {
    if (this.busy) throw Error("A project batch is already being created");
    this.busy = true;
    try {
      return await this.createBatch({ revision, requestId, projects });
    } finally {
      this.busy = false;
    }
  }
  async createBatch({ revision, requestId, projects }) {
    if (typeof requestId !== "string" || !/^[\w-]{1,100}$/.test(requestId))
      throw Error("A stable requestId is required");
    if (!Array.isArray(projects) || !projects.length || projects.length > 20)
      throw Error("Create 1–20 projects per batch");
    const owner = this.owner(),
      parent = path.join(owner.folder, "projects"),
      dir = path.join(this.workspace, ".editor/project-branches");
    fs.mkdirSync(dir, { recursive: true });
    const receipt = path.join(dir, requestId + ".json"),
      signature = createHash("sha256")
        .update(JSON.stringify(ordered({ revision, projects })))
        .digest("hex");
    if (fs.existsSync(receipt)) {
      const saved = JSON.parse(fs.readFileSync(receipt));
      if (saved.signature !== signature)
        throw Error("requestId already used with different input");
      for (const n of saved.projects)
        if (
          typeof n.name !== "string" ||
          !n.name ||
          n.name.startsWith(".") ||
          /[\\/]/.test(n.name) ||
          !/^\.cmrx-branch-[\w-]+$/.test(n.stage)
        )
          throw Error("Invalid batch recovery record");
      const owns = (folder) =>
        fs.existsSync(path.join(folder, "context/branch.json")) &&
        JSON.parse(fs.readFileSync(path.join(folder, "context/branch.json")))
          .batch === saved.batch;
      if (saved.status === "complete") {
        for (const n of saved.projects)
          if (
            !owns(path.join(parent, n.name)) ||
            !fs.existsSync(path.join(parent, n.name, "project.json"))
          )
            throw Error(
              "A created project was moved or removed; inspect workspace projects",
            );
        return { ...saved, replayed: true };
      }
      if (saved.status === "ready") {
        // Published children may already contain user work. Never delete/re-copy them.
        for (const n of saved.projects) {
          const final = path.join(parent, n.name),
            stage = path.join(parent, n.stage);
          if (fs.existsSync(final)) {
            if (!owns(final))
              throw Error("Project name belongs to another batch");
          } else if (
            !owns(stage) ||
            !fs.existsSync(path.join(stage, "project.json"))
          )
            throw Error(
              "Incomplete staged project; preserve it and inspect before retrying",
            );
        }
        for (const n of saved.projects) {
          const final = path.join(parent, n.name);
          if (!fs.existsSync(final)) {
            fs.mkdirSync(final);
            fs.renameSync(path.join(parent, n.stage), final);
          }
        }
        saved.status = "complete";
        atomic(receipt, saved);
        return { ...saved, replayed: true };
      }
      for (const n of saved.projects)
        if (fs.existsSync(path.join(parent, n.name)))
          throw Error(
            "Interrupted batch contains published projects; preserve them before retrying",
          );
      for (const n of saved.projects) {
        const stage = path.join(parent, n.stage);
        if (fs.existsSync(stage)) {
          if (!owns(stage))
            throw Error("Unrecognized staging folder; preserve it");
          fs.rmSync(stage, { recursive: true });
        }
      }
    }
    const { project: source, error } = await this.editor("/api/context");
    if (error)
      throw Error(
        "Resolve the current project conflict before creating projects: " +
          error,
      );
    if (source.revision !== revision)
      throw Error(
        "Revision conflict: read editor_context before creating projects",
      );
    const names = new Set(),
      derived = projects.map((spec) => {
        const result = branchProject(source, spec);
        validate(result.project);
        const key = spec.name.toLowerCase();
        if (names.has(key)) throw Error("Project names must be distinct");
        names.add(key);
        if (fs.existsSync(path.join(parent, spec.name)))
          throw Error("Project already exists: " + spec.name);
        return { spec, ...result };
      });
    const batch = randomUUID(),
      record = {
        schemaVersion: 1,
        requestId,
        signature,
        batch,
        status: "preparing",
        projects: derived.map((d) => ({
          name: d.spec.name,
          folder: "projects/" + d.spec.name,
          stage: ".cmrx-branch-" + randomUUID(),
          warnings: d.warnings,
        })),
      };
    atomic(receipt, record);
    const owned = [];
    try {
      const inputs = files(this.workspace),
        before = new Map(
          inputs.map((f) => {
            const s = fs.statSync(path.join(this.workspace, f));
            return [f, [s.size, s.mtimeMs, s.ctimeMs].join(":")];
          }),
        );
      const context = {};
      const workspaceInstructions = path.join(owner.folder, "AGENTS.md");
      let workspaceGuidance = "";
      if (fs.existsSync(workspaceInstructions)) {
        if (fs.lstatSync(workspaceInstructions).isSymbolicLink())
          throw Error("Workspace instructions cannot be a symlink");
        workspaceGuidance = fs.readFileSync(workspaceInstructions, "utf8");
      }
      for (const n of ["AGENTS.md", "memory.md", "script.md"]) {
        const full = path.join(this.workspace, n);
        if (fs.existsSync(full)) {
          if (fs.lstatSync(full).isSymbolicLink())
            throw Error("Context cannot be a symlink");
          context[n] = fs.readFileSync(full, "utf8");
        }
      }
      for (let i = 0; i < derived.length; i++) {
        const d = derived[i],
          n = record.projects[i],
          stage = path.join(parent, n.stage);
        this.onProgress(`Creating ${d.spec.name} · ${i + 1}/${derived.length}`);
        fs.mkdirSync(stage);
        owned.push(stage);
        fs.mkdirSync(path.join(stage, "context"));
        atomic(path.join(stage, "context/branch.json"), {
          schemaVersion: 1,
          batch,
          requestId,
          parent: source.name,
          parentRevision: revision,
          ranges: d.spec.ranges ?? [],
          brief: d.spec.brief,
          warnings: d.warnings,
        });
        for (const f of inputs) {
          const reserved = [
            "context/branch.json",
            "context/source-project.json",
            "context/parent-AGENTS.md",
            "context/parent-memory.md",
            "context/parent-script.md",
            "context/workspace-AGENTS.md",
          ];
          const target = reserved.includes(f)
            ? "context/parent-archive/" + batch + "/" + f.slice(8)
            : f;
          const to = path.join(stage, target);
          await fsp.mkdir(path.dirname(to), { recursive: true });
          await fsp.copyFile(
            path.join(this.workspace, f),
            to,
            fs.constants.COPYFILE_FICLONE,
          );
        }
        for (const [n, text] of Object.entries(context))
          fs.writeFileSync(path.join(stage, "context", "parent-" + n), text);
        atomic(path.join(stage, "context/source-project.json"), source);
        fs.writeFileSync(
          path.join(stage, "context/workspace-AGENTS.md"),
          workspaceGuidance,
        );
        atomic(path.join(stage, "project.json"), d.project);
        atomic(path.join(stage, "project-name.json"), { name: d.spec.name });
        fs.mkdirSync(path.join(stage, ".editor"));
        atomic(path.join(stage, ".editor/onboarding.json"), { complete: true });
        fs.writeFileSync(
          path.join(stage, "AGENTS.md"),
          (context["AGENTS.md"] ?? "") +
            "\n\n# This project\n" +
            d.spec.brief +
            "\n" +
            (d.spec.instructions ?? "") +
            "\nThis is an independent extract. Parent context is reference material, not a task queue. Workspace guidance is snapshotted in context/workspace-AGENTS.md; live workspace instructions still apply.\n",
        );
        fs.writeFileSync(
          path.join(stage, "script.md"),
          d.spec.script ?? "# " + d.spec.name + "\n\n" + d.spec.brief + "\n",
        );
        fs.writeFileSync(
          path.join(stage, "memory.md"),
          d.spec.memory ??
            "# Project brief\n\n" +
              d.spec.brief +
              "\n\nSource selection: see context/branch.json. Parent decisions and script are preserved under context/.\n",
        );
      }
      const latest = await this.editor("/api/context");
      if (latest.error || latest.project.revision !== revision)
        throw Error(
          "Source project changed during copy; retry with current revision",
        );
      if (
        workspaceGuidance &&
        fs.readFileSync(workspaceInstructions, "utf8") !== workspaceGuidance
      )
        throw Error("Workspace guidance changed during copy");
      for (const [n, text] of Object.entries(context))
        if (fs.readFileSync(path.join(this.workspace, n), "utf8") !== text)
          throw Error("Source context changed during copy");
      if (JSON.stringify(files(this.workspace)) !== JSON.stringify(inputs))
        throw Error("Source files changed during copy");
      for (const f of inputs) {
        const s = fs.statSync(path.join(this.workspace, f));
        if (before.get(f) !== [s.size, s.mtimeMs, s.ctimeMs].join(":"))
          throw Error("Source file changed during copy: " + f);
      }
      record.status = "ready";
      atomic(receipt, record);
      for (const n of record.projects) {
        const target = path.join(parent, n.name),
          stage = path.join(parent, n.stage);
        fs.mkdirSync(target);
        owned.push(target);
        fs.renameSync(stage, target);
      }
      record.status = "complete";
      atomic(receipt, record);
      return { ...record, replayed: false };
    } catch (e) {
      for (const folder of owned.reverse())
        if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true });
      fs.rmSync(receipt, { force: true });
      throw e;
    }
  }
}
