import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { SecretStore } from "./secret-store.mjs";
import { ProjectSkills } from "./project-skills.mjs";
import { Connections } from "./connections.mjs";
import { readWeb, fetchPublic } from "./web-access.mjs";
import {
  inspectFrame,
  inspectImage,
  inspectAudio,
} from "./visual-inspection.mjs";
export class ProjectAgent {
  constructor({ root, workspace, workspaceRoot, codec, onChange = () => {} }) {
    this.root = root;
    this.workspace = workspace;
    this.onChange = onChange;
    this.secrets = new SecretStore(root, codec);
    this.skills = new ProjectSkills({ root, workspace, workspaceRoot });
    this.connections = new Connections({
      root,
      secrets: this.secrets,
      onChange,
    });
    this.pending = new Map();
    this.tickets = new Map();
    this.generation = 0;
    this.actions = [];
    this.links = [];
    this.actionsFile = path.join(workspace, ".editor/actions.json");
    this.linksFile = path.join(workspace, ".editor/links.json");
    try {
      this.actions = JSON.parse(fs.readFileSync(this.actionsFile));
      for (const action of this.actions)
        if (action.status === "running") action.status = "unknown";
    } catch {}
    try {
      this.links = JSON.parse(fs.readFileSync(this.linksFile));
    } catch {}
  }
  snapshot() {
    return {
      connections: this.connections.list(),
      secrets: this.secrets.list(),
      skills: this.skills.catalog(),
      approvals: [...this.pending.values()].map((p) => p.view),
      actions: this.actions.slice(-8),
      links: this.links.slice(-20),
    };
  }
  context() {
    let importedAssets = [];
    try {
      importedAssets = JSON.parse(
        fs.readFileSync(
          path.join(this.workspace, ".editor/imported-assets.json"),
        ),
      );
    } catch {}
    return {
      importedAssets,
      assetLibrary: this.assets?.settings(),
      projectPath: this.workspace,
      workspaceInstructions: this.skills.workspaceText(),
      instructions: this.skills.text("AGENTS.md"),
      memory: this.skills.text("memory.md"),
      skills: this.skills.catalog(),
      connections: this.connections
        .list()
        .map(({ id, name, type, status }) => ({ id, name, type, status })),
      tools: this.links.slice(-10),
    };
  }
  persist() {
    fs.writeFileSync(
      this.actionsFile,
      JSON.stringify(this.actions.slice(-100)),
      { mode: 0o600 },
    );
    fs.writeFileSync(this.linksFile, JSON.stringify(this.links.slice(-50)), {
      mode: 0o600,
    });
    this.onChange();
  }
  async approve(title, details) {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.onChange();
        reject(Error("Action was not approved in time. It was not run."));
      }, 45000);
      this.pending.set(id, {
        view: { id, title, details: JSON.parse(this.secrets.redact(details)) },
        resolve: (allowed) => {
          clearTimeout(timer);
          this.pending.delete(id);
          this.onChange();
          allowed
            ? resolve()
            : reject(Error("Action was declined. It was not run."));
        },
      });
      this.onChange();
    });
  }
  decide(id, allowed) {
    const p = this.pending.get(id);
    if (!p) throw Error("This action is no longer waiting");
    p.resolve(allowed === true);
  }
  cancel() {
    this.generation++;
    this.connections.cancel();
    for (const p of [...this.pending.values()]) p.resolve(false);
  }
  async tool(name, args, { editor, playground }) {
    if (name === "assets_list") return this.assets.list(args);
    if (name === "asset_read")
      return this.assets.inspect(args.scope, args.path);
    if (name === "asset_use") return this.assets.use(args);
    if (name === "asset_promote") return this.assets.promote(args.path);
    if (name === "skills_list") return this.skills.catalog();
    if (name === "skill_read") return this.skills.read(args.id, args.file);
    if (name === "project_notes")
      return args.text === undefined
        ? { file: args.file, text: this.skills.text(args.file) }
        : this.skills.write(args.file, args.text);
    if (name === "connections_list") return this.context().connections;
    if (name === "mcp_tools") return this.connections.tools(args.connection);
    if (name === "mcp_resources")
      return this.connections.resources(args.connection);
    if (name === "mcp_resource_read")
      return this.connections.read(args.connection, args.uri);
    if (name === "mcp_prompts")
      return this.connections.prompts(args.connection);
    if (name === "mcp_prompt")
      return this.connections.prompt(
        args.connection,
        args.name,
        args.arguments,
      );
    if (name === "web_read") return readWeb(args.url);
    if (name === "asset_fetch") {
      if (typeof args.path !== "string" || !args.path.startsWith("assets/"))
        throw Error("Choose a new filename under assets/");
      const file = playground.file(args.path, true);
      if (fs.existsSync(file))
        throw Error("This asset already exists; choose a new filename");
      const result = await fetchPublic(args.url, { limit: 20000000 });
      if (
        result.status < 200 ||
        result.status >= 300 ||
        !/^image\/(png|jpeg|webp)$/.test(result.type)
      )
        throw Error("Choose a public PNG, JPEG or WebP image");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      playground.file(args.path, true);
      fs.writeFileSync(file, result.body, { mode: 0o600, flag: "wx" });
      const receipt = {
        path: args.path,
        source: result.url,
        mimeType: result.type,
        size: result.body.length,
        sha256: createHash("sha256").update(result.body).digest("hex"),
      };
      const receipts = path.join(this.workspace, ".editor/downloads.jsonl");
      fs.appendFileSync(receipts, JSON.stringify(receipt) + "\n", {
        mode: 0o600,
      });
      this.onChange();
      return receipt;
    }
    if (name === "artifact_info") {
      const job = playground.jobs.find((j) => j.id === args.jobId);
      const file = playground.artifact(args.jobId);
      if (!file || !job) throw Error("Choose a completed export job");
      return {
        jobId: job.id,
        revision: job.revision,
        path: file,
        size: fs.statSync(file).size,
        link: "artifact:" + job.id,
        mimeType: "video/mp4",
      };
    }
    if (name === "editor_frame")
      return inspectFrame({
        workspace: this.workspace,
        project: (await editor("/api/context")).project,
        playground,
        args,
      });
    if (name === "editor_audio")
      return inspectAudio({
        workspace: this.workspace,
        project: (await editor("/api/context")).project,
        playground,
        args,
      });
    if (name === "workspace_image")
      return inspectImage(this.workspace, args.path);
    if (name === "tool_open") {
      let link;
      if (args.url) {
        const u = new URL(args.url);
        if (u.protocol !== "https:" || u.username || u.password)
          throw Error("Use an HTTPS tool link");
        link = {
          id: randomUUID(),
          title: String(args.title || u.hostname).slice(0, 150),
          url: u.href,
          kind: "external",
        };
      } else {
        const name = args.path;
        if (
          typeof name !== "string" ||
          !/^tools\/[\w/-]+\.html$/.test(name) ||
          name.includes("..")
        )
          throw Error("Save an HTML tool in tools/ first");
        if (fs.lstatSync(path.join(this.workspace, "tools")).isSymbolicLink())
          throw Error("Tool folder cannot be a symlink");
        const file = fs.realpathSync(path.join(this.workspace, name));
        if (
          !file.startsWith(
            fs.realpathSync(path.join(this.workspace, "tools")) + path.sep,
          )
        )
          throw Error("Invalid tool path");
        if (fs.statSync(file).size > 1000000) throw Error("Tool is too large");
        link = {
          id: randomUUID(),
          title: String(args.title || "Project tool").slice(0, 150),
          path: name,
          kind: "local",
        };
      }
      this.links.push(link);
      this.persist();
      return link;
    }
    if (name === "mcp_call" || name === "connection_request") {
      const generation = this.generation;
      const connection = this.connections.entry(args.connection);
      let readonly = false;
      if (name === "mcp_call") {
        const tool = (await this.connections.tools(connection.id)).find(
          (t) => t.name === args.tool,
        );
        if (!tool) throw Error("Tool not found");
        readonly =
          tool.annotations?.readOnlyHint === true &&
          tool.annotations?.destructiveHint !== true;
      } else readonly = ["GET", "HEAD"].includes(args.method || "GET");
      if (generation !== this.generation)
        throw Error("Action canceled before execution");
      if (!readonly)
        await this.approve(
          `${connection.name} · ${args.tool || args.method || "Request"}`,
          args,
        );
      if (generation !== this.generation)
        throw Error("Action canceled before execution");
      const action = {
        id: randomUUID(),
        title: `${connection.name} · ${args.tool || args.method || "Request"}`,
        status: "running",
        createdAt: new Date().toISOString(),
      };
      this.actions.push(action);
      this.persist();
      try {
        let file;
        if (args.artifactId) {
          file = playground.artifact(args.artifactId);
          if (
            !file ||
            !fs
              .realpathSync(file)
              .startsWith(fs.realpathSync(playground.jobsDir) + path.sep)
          )
            throw Error("Choose a completed project export to upload");
        }
        const value =
          name === "mcp_call"
            ? await this.connections.call(
                connection.id,
                args.tool,
                args.arguments,
              )
            : await this.connections.request(connection.id, {
                method: args.method,
                route: args.route,
                body: args.body,
                file,
                uploadField: args.uploadField,
              });
        if (value?.isError) throw Error(JSON.stringify(value.content));
        action.status = value?.status >= 400 ? "unknown" : "complete";
        this.persist();
        return JSON.parse(this.secrets.redact(value));
      } catch (error) {
        action.status = readonly ? "failed" : "unknown";
        this.persist();
        throw Error(this.secrets.redact(error.message));
      }
    }
    return undefined;
  }
  ticket(id) {
    this.toolFile(id);
    const ticket = randomUUID();
    this.tickets.set(ticket, { id, expires: Date.now() + 300000 });
    for (const [key, v] of this.tickets)
      if (v.expires < Date.now()) this.tickets.delete(key);
    return "/tool-frame?ticket=" + ticket;
  }
  ticketFile(ticket) {
    const value = this.tickets.get(ticket);
    if (!value || value.expires < Date.now())
      throw Error("Tool link expired; reopen it from chat");
    return this.toolFile(value.id);
  }
  toolFile(id) {
    const l = this.links.find((l) => l.id === id && l.kind === "local");
    if (!l) throw Error("Tool not found");
    if (fs.lstatSync(path.join(this.workspace, "tools")).isSymbolicLink())
      throw Error("Tool folder cannot be a symlink");
    const p = fs.realpathSync(path.join(this.workspace, l.path));
    if (
      !p.startsWith(
        fs.realpathSync(path.join(this.workspace, "tools")) + path.sep,
      )
    )
      throw Error("Invalid tool");
    return p;
  }
  async close() {
    this.cancel();
    await this.connections.close();
  }
}
