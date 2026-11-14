import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Checkpoints } from "../../local-editor/dist/project-storage.mjs";
import {
  exportOTIO,
  inspectOTIO,
} from "../../local-editor/dist/project-core.mjs";
export class ProjectServices {
  constructor({ workspace, editor, playground }) {
    Object.assign(this, { workspace, editor, playground });
    this.checkpoints = new Checkpoints(workspace);
    this.restoring = false;
  }
  async run(action, args = {}) {
    if (this.busy) throw Error("A project transaction is still running");
    const mutation = ![
      "source-window",
      "checkpoint-list",
      "checkpoint-diff",
      "interchange-inspect",
    ].includes(action);
    if (mutation) this.busy = true;
    try {
      return await this.execute(action, args);
    } finally {
      if (mutation) this.busy = false;
    }
  }
  async execute(action, args = {}) {
    const { project } = await this.editor("/api/context");
    const requireRevision = () => {
      if (project.revision !== args.revision)
        throw Error("Revision conflict: refresh project before continuing");
    };
    if (action === "source-window") {
      const q = new URLSearchParams({
        id: args.assetId,
        start: String(args.start ?? 0),
        duration: String(args.duration ?? 30),
      });
      return this.editor("/api/source-window?" + q);
    }
    if (action === "checkpoint-list")
      return { checkpoints: this.checkpoints.list() };
    if (action === "checkpoint-diff")
      return this.checkpoints.diff(args.id, project);
    if (action === "checkpoint-create") {
      requireRevision();
      return this.checkpoints.create(project, args.label);
    }
    if (action === "checkpoint-restore") {
      requireRevision();
      if (this.restoring) throw Error("Restore in progress");
      this.restoring = true;
      try {
        return await this.checkpoints.restore(args.id, {
          baseRevision: args.revision,
          current: project,
          apply: (p, revision) =>
            this.editor("/api/project", {
              revision,
              project: p,
              label: "Restore checkpoint",
              actor: "checkpoint",
            }),
        });
      } finally {
        this.restoring = false;
      }
    }
    if (action === "interchange-export") {
      requireRevision();
      const result = exportOTIO(project, { mediaPrefix: "../../" }),
        folder = path.join(
          this.workspace,
          "exports",
          `interchange-r${project.revision}-${Date.now()}`,
        );
      const exportsDir = path.dirname(folder);
      if (
        fs.existsSync(exportsDir) &&
        fs.lstatSync(exportsDir).isSymbolicLink()
      )
        throw Error("Unsafe export destination");
      fs.mkdirSync(folder, { recursive: true });
      for (const file of ["project.otio", "project.native.json"]) {
        const target = path.join(folder, file);
        if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
          throw Error("Unsafe export destination");
      }
      fs.writeFileSync(
        path.join(folder, "project.otio"),
        JSON.stringify(result.timeline, null, 2) + "\n",
      );
      fs.writeFileSync(
        path.join(folder, "project.native.json"),
        JSON.stringify(project, null, 2) + "\n",
      );
      const checkpoint = this.checkpoints.create(
        project,
        "Interchange r" + project.revision,
      );
      const source = path.join(
          this.checkpoints.location(checkpoint.id),
          "files",
        ),
        dest = path.join(folder, "sources");
      fs.cpSync(source, dest, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      return {
        path: path.relative(this.workspace, folder),
        warnings: result.warnings,
        nativeProject: "project.native.json",
        sources: "sources/",
      };
    }
    if (action === "interchange-import") {
      requireRevision();
      const parsed = inspectOTIO(args.timeline),
        clips = parsed.clips.map((c) => {
          const normalized = String(c.path).replace(/^(\.\.\/)+/, "");
          const asset = project.assets.find((a) => a.path === normalized);
          if (!asset)
            throw Error(
              "Import media into this project before importing its editing timeline: " +
                c.path,
            );
          return {
            id:
              c.id &&
              project.clips.some(
                (old) => old.id === c.id && old.assetId === asset.id,
              )
                ? c.id
                : "clip-" + randomUUID(),
            name: c.name ?? asset.name,
            kind: "video",
            assetId: asset.id,
            start: c.start,
            in: c.in,
            duration: c.duration,
            track: c.track,
            x: 0,
            y: 0,
            width: project.width,
            height: project.height,
            muted: false,
          };
        });
      const next = {
        ...project,
        clips: [...project.clips.filter((c) => c.kind !== "video"), ...clips],
      };
      delete next.previewMode;
      delete next.renderedOutput;
      const accepted = await this.editor("/api/project", {
        revision: project.revision,
        project: next,
        label: "Import editing timeline",
      });
      return { project: accepted, warnings: parsed.warnings };
    }
    if (action === "interchange-inspect") return inspectOTIO(args.timeline);
    if (action === "output-register") {
      requireRevision();
      return this.playground.registerOutput(
        args.path,
        args.revision,
        this.editor,
      );
    }
    if (action === "output-interactive") {
      requireRevision();
      const next = structuredClone(project);
      delete next.previewMode;
      delete next.renderedOutput;
      return this.editor("/api/project", {
        revision: project.revision,
        project: next,
      });
    }
    throw Error("Unknown project action");
  }
}
