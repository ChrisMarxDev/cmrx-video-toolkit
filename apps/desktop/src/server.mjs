import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { commentWorkflow } from "./agent-instructions.mjs";
import { ProjectAgent } from "./project-agent.mjs";
import { ProviderManager } from "./provider-manager.mjs";
import { pendingComments, commentKey } from "./comment-payload.mjs";
import { logoAssets } from "./brand-ui.mjs";
import { Playground } from "./playground.mjs";
import { executeTool } from "./tools.mjs";
import { engineStatus } from "./engine-status.mjs";
import { AssetLibrary } from "./asset-library.mjs";
import { importAsset } from "./import-asset.mjs";
import { importVideo } from "./import-video.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, "../../local-editor");
export async function startApp({
  workspace,
  port = 0,
  home = path.join(os.homedir(), ".local/share/cmrx-chat-editor/codex"),
  providerFactory,
  runtimeManager,
  claudeHome = path.join(os.homedir(), ".local/share/cmrx-chat-editor/claude"),
  openExternal = () => {},
  pickVideo,
  pickProject,
  projectInfo,
  recentProjects = () => [],
  playgroundFactory,
  agentRoot,
  workspaceRoot,
  secretCodec,
  pickSkill,
  pickAssetLibrary,
  openAssetFolder,
  trashAsset,
  autoPreview = !providerFactory,
  desktopTabs = false,
  renderQueue,
  sharedEnabled,
} = {}) {
  workspace = path.resolve(
    workspace ||
      path.join(
        os.homedir(),
        ".local/share/cmrx-chat-editor/projects/untitled",
      ),
  );
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(path.join(workspace, "media"), { recursive: true });
  if (!fs.existsSync(path.join(workspace, "project.json")))
    fs.writeFileSync(
      path.join(workspace, "project.json"),
      JSON.stringify({
        schemaVersion: 1,
        revision: 0,
        name: projectInfo?.name || "Untitled video",
        width: 1920,
        height: 1080,
        fps: 24,
        assets: [],
        clips: [],
      }),
    );
  const child = spawn(
    process.execPath,
    [
      path.join(base, "dist/server.mjs"),
      "--workspace",
      workspace,
      "--port",
      "0",
    ],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        EDITOR_DISABLE_EXTENSIONS: "1",
        EDITOR_RECOVER_STALE_LOCK: "1",
        EDITOR_PARENT_PID: String(process.pid),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const childDone = new Promise((resolve) => child.once("close", resolve));
  let exited = false,
    diagnostic = "";
  child.on("error", (e) => {
    exited = true;
    diagnostic = e.message;
  });
  child.on("exit", () => {
    exited = true;
  });
  child.stderr.on("data", (d) => (diagnostic += d.toString().slice(-2000)));
  child.stdout.resume();
  const cf = path.join(workspace, ".editor/connection.json");
  let connection;
  for (let i = 0; i < 150; i++) {
    if (exited)
      throw Error(
        diagnostic.includes("Workspace already locked")
          ? "This project is open in another window. Close it there, then try again."
          : "Editor could not start: " + diagnostic,
      );
    if (fs.existsSync(cf)) {
      const candidate = JSON.parse(fs.readFileSync(cf));
      if (candidate.pid === child.pid) {
        connection = candidate;
        break;
      }
    }
    await delay(100);
  }
  if (!connection) {
    child.kill();
    throw Error("Editor startup timed out");
  }
  const token = randomBytes(32).toString("hex"),
    clients = new Set();
  const chatFolder = workspaceRoot
    ? path.join(workspace, "chats")
    : path.join(workspace, ".editor");
  fs.mkdirSync(chatFolder, { recursive: true });
  const historyFile = path.join(
    chatFolder,
    workspaceRoot ? "history.json" : "chat.json",
  );
  const oldHistory = path.join(workspace, ".editor/chat.json");
  if (workspaceRoot && !fs.existsSync(historyFile) && fs.existsSync(oldHistory))
    fs.copyFileSync(oldHistory, historyFile, fs.constants.COPYFILE_EXCL);
  let history = [];
  try {
    history = JSON.parse(fs.readFileSync(historyFile));
  } catch {}
  const queueFile = path.join(workspace, ".editor/chat-queue.json");
  let queue = [];
  try {
    queue = JSON.parse(fs.readFileSync(queueFile)).items.filter(
      (item) => !history.some((m) => m.queueId === item.id),
    );
  } catch {}
  const engine = providerFactory
    ? { available: true, missing: [] }
    : engineStatus();
  const onboardingFile = path.join(workspace, ".editor/onboarding.json");
  let onboarding = {};
  try {
    onboarding = JSON.parse(fs.readFileSync(onboardingFile));
  } catch {}
  const info = projectInfo || {
    selected: true,
    name: path.basename(workspace),
    folder: workspace,
  };
  // Interrupted turns remain readable; never silently rerun a mutation after restart.
  const draftFile = path.join(workspace, ".editor/draft.json");
  let draft = "";
  try {
    draft = JSON.parse(fs.readFileSync(draftFile)).text || "";
  } catch {}
  const state = {
    desktopTabs,
    engine,
    projectInfo: info,
    onboarding,
    recentProjects: recentProjects(),
    provider: "chatgpt",
    connected: false,
    busy: false,
    messages: history,
    draft,
    queue,
    queuePaused: queue.length > 0,
    activity: "",
    error: null,
    jobs: [],
  };
  let closing = false;
  let turnGeneration = 0,
    activePayload = null;
  let assistantItem = null;
  let assistant = null,
    manager,
    ready;
  const save = () => {
    const tmp = historyFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state.messages), { mode: 0o600 });
    fs.renameSync(tmp, historyFile);
    fs.writeFileSync(
      queueFile + ".tmp",
      JSON.stringify({ items: state.queue }),
      { mode: 0o600 },
    );
    fs.renameSync(queueFile + ".tmp", queueFile);
  };
  let playground, agent;
  let importController, importTask;
  let importing = false,
    preparingRender = false;
  let activeWrites = 0;
  const locked = () =>
    state.busy ||
    state.switching ||
    importing ||
    preparingRender ||
    !!playground?.blocking;
  const publish = () => {
    state.locked = locked();
    state.importing = importing;
    try {
      const doc = JSON.parse(
        fs.readFileSync(path.join(workspace, "project.json")),
      );
      state.pendingComments = pendingComments(doc, [
        ...state.messages,
        ...state.queue,
        ...(activePayload ? [activePayload] : []),
      ]);
      state.mediaCount = doc.clips.filter((c) => c.kind === "video").length;
      state.clipCount = doc.clips.length;
      state.projectName = info.selected ? info.name : doc.name;
    } catch {}
    if (playground) Object.assign(state, playground.state());
    if (agent) Object.assign(state, agent.snapshot());
    if (manager) {
      Object.assign(state, manager.snapshot());
      state.connected = !!manager.entries.get(manager.id).connected;
    }
    const value = "data: " + JSON.stringify(state) + "\n\n";
    for (const c of clients) c.write(value);
  };
  const editor = async (route, body) => {
    const r = await fetch(connection.url + route, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + connection.token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await r.json();
    if (!r.ok) throw Error(value.error || JSON.stringify(value));
    return value;
  };
  agentRoot ||= providerFactory
    ? path.join(workspace, ".editor/agent-profile")
    : path.join(path.dirname(home), "project-agent");
  agent = new ProjectAgent({
    root: agentRoot,
    workspace,
    workspaceRoot,
    codec: secretCodec,
    onChange: publish,
  });
  playground = playgroundFactory
    ? playgroundFactory({ workspace, onChange: publish })
    : new Playground({
        workspace,
        onChange: publish,
        skillRoot: agent.skills.shared,
        renderQueue,
      });
  const assets = new AssetLibrary({
    workspace,
    root: agentRoot,
    workspaceRoot,
    trash: trashAsset,
  });
  agent.assets = assets;
  const onEvent = async (e, providerId = manager?.id) => {
    if (e.type === "accountChanged") {
      try {
        await manager.refresh(providerId, false);
      } catch (error) {
        manager.entries.get(providerId).error = error.message;
      }
      if (e.loginFinished)
        manager.entries.get(providerId).authenticating = false;
      if (e.error) manager.entries.get(providerId).error = e.error;
      publish();
      return;
    }
    if (providerId !== manager?.id) return;
    if (e.type === "delta") {
      if (!assistant) {
        assistant = {
          role: "assistant",
          text: "",
          provider: manager?.id,
          model: manager?.selected.model,
        };
        state.messages.push(assistant);
      }
      if (e.itemId && assistantItem && e.itemId !== assistantItem)
        assistant.text += "\n\n";
      assistantItem = e.itemId || assistantItem;
      assistant.text += e.text;
    }
    if (e.type === "complete") {
      state.busy = false;
      state.activity = "";
      if (e.error) {
        state.error = e.error;
        state.queuePaused = true;
      }
      save();
    }
    if (e.type === "error") {
      state.busy = false;
      state.error = e.message;
      state.queuePaused = true;
      save();
    }
    if (e.type === "activity") state.activity = e.text;
    publish();
  };
  const onTool = async (name, args, providerId = manager?.id) => {
    if (providerId !== manager?.id || !state.busy)
      throw Error("This provider does not own an active editing turn");
    state.activity =
      name === "editor_context"
        ? "Checking the video…"
        : name === "editor_job"
          ? "Checking the render…"
          : name === "editor_render"
            ? "Rendering a preview…"
            : name.startsWith("skill")
              ? "Reading a skill…"
              : name.startsWith("mcp") || name.startsWith("connection")
                ? "Using a connection…"
                : name === "web_read"
                  ? "Reading a web page…"
                  : name === "editor_frame" || name === "workspace_image"
                    ? "Inspecting an image…"
                    : "Working on your project…";
    publish();
    let extra;
    try {
      extra = await agent.tool(name, args, { editor, playground });
    } catch (error) {
      throw Error(agent.secrets.redact(error.message));
    }
    if (extra !== undefined) return JSON.parse(agent.secrets.redact(extra));
    if (name === "workspace_files") return playground.files();
    if (name === "workspace_read") return { text: playground.read(args.path) };
    if (name === "workspace_write")
      return playground.write(args.path, args.content);
    if (name === "workspace_exec") return playground.exec(args.argv);
    if (name === "editor_job") {
      const job = playground.jobs.find((j) => j.id === args.jobId);
      if (!job) throw Error("Render job not found");
      // Rendering takes minutes; avoid repeated full project/transcript responses.
      for (let n = 0; n < 80 && job.status === "running" && state.busy; n++)
        await delay(250);
      return { ...job, error: job.error?.slice(0, 8000) };
    }
    if (name === "editor_context") {
      if (playground.running) await delay(2000);
      return {
        ...(await editor("/api/context")),
        playground: playground.state(),
        sourceFiles: playground.files(),
        projectAgent: agent.context(),
      };
    }
    if (name === "editor_render") return playground.render(args.revision);
    return executeTool(name, args, editor);
  };
  manager = new ProviderManager({
    workspace,
    home,
    claudeHome,
    connectionFile: path.join(workspace, ".editor/chat-connection.json"),
    factory: providerFactory,
    runtimeManager,
    onEvent,
    onTool,
    onChange: publish,
    enabled: sharedEnabled,
  });
  state.provider = manager.id;
  // Every window starts disconnected, including when its private profile has credentials.
  ready = Promise.resolve();
  publish();
  async function startMessage(item) {
    if (closing) return { ok: true, canceled: true };
    activePayload = item;
    const requestTurn = ++turnGeneration;
    try {
      state.busy = true;
      publish();
      await manager.refresh(manager.id);
      if (requestTurn !== turnGeneration) {
        return { ok: true, canceled: true };
      }
      if (!state.connected)
        throw Error(
          "Connect " +
            manager.entries.get(manager.id).name +
            " in settings first",
        );
      if (playground.running) {
        lastOverlayAttempt = undefined;
        playground.cancel();
        await playground.renderTask;
      }
      // Reserve ownership before draining already accepted manual requests.
      while (activeWrites) await delay(10);
      if (requestTurn !== turnGeneration) {
        return { ok: true, canceled: true };
      }
      state.error = null;
      assistant = null;
      assistantItem = null;
      const current = await editor("/api/context");
      const pending = current.project.comments || [];
      const comments = (item.comments || []).map((c) => {
        const live = pending.find((p) => p.id === c.id);
        if (
          !live ||
          live.status !== "open" ||
          commentKey(live) !== commentKey(c)
        )
          throw Error(
            "A comment changed. Review the updated notes and send again.",
          );
        return structuredClone(live);
      });
      if (new Set(comments.map((c) => c.id)).size !== comments.length)
        throw Error("Duplicate comments");
      if (requestTurn !== turnGeneration) return { ok: true, canceled: true };
      state.queue = state.queue.filter((entry) => entry.id !== item.id);
      activePayload = null;
      state.messages.push({
        role: "user",
        text: item.text,
        ...(item.id ? { queueId: item.id } : {}),
        ...(comments.length ? { comments } : {}),
        ...(item.assets?.length ? { assets: item.assets } : {}),
      });
      state.activity = "Working on your project…";
      save();
      publish();
      const context = {
        ...(await onTool("editor_context", {})),
        recentConversation: state.messages.slice(-10),
        attachedAssets: (item.assets || []).map((ref) => ({
          ...assets.inspect("project", ref.path),
          workspacePath: "assets/" + ref.path,
        })),
        attachedComments: comments,
        commentWorkflow,
        projectAgent: agent.context(),
      };
      const activeProvider = manager.id;
      if (requestTurn === turnGeneration && state.busy)
        manager.active
          .prompt(
            item.text ||
              (item.assets?.length
                ? "Use the attached project assets. Inspect their instructions before editing."
                : "Apply the attached timed comments to the video. Check each comment anchor against the current project before editing."),
            context,
            item.selection || manager.selected,
          )
          .catch((e) => {
            if (requestTurn === turnGeneration)
              onEvent({ type: "error", message: e.message }, activeProvider);
          });
      return { ok: true };
    } catch (error) {
      if (requestTurn !== turnGeneration) return { ok: true, canceled: true };
      state.busy = false;
      state.queuePaused = true;
      state.error = error.message;
      save();
      throw error;
    } finally {
      if (requestTurn === turnGeneration) activePayload = null;
      publish();
    }
  }
  const server = createServer(async (req, res) => {
    let reservedImport = false,
      reservedRender = false;
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (
        ![
          "127.0.0.1:" + server.address().port,
          "localhost:" + server.address().port,
        ].includes(req.headers.host)
      )
        throw Error("Invalid Host");
      if (
        req.headers.origin &&
        req.headers.origin !== "http://" + req.headers.host
      )
        throw Error("Cross-origin request denied");
      if (url.pathname === "/tool-frame") {
        const file = agent.ticketFile(url.searchParams.get("ticket"));
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; connect-src 'none'; base-uri 'none'; sandbox allow-scripts allow-downloads",
        });
        res.end(fs.readFileSync(file));
        return;
      }
      if (url.pathname.startsWith("/chat/")) {
        if (
          req.headers.authorization !== "Bearer " + token &&
          url.searchParams.get("token") !== token
        ) {
          res.writeHead(403);
          res.end();
          return;
        }
        if (
          ["/chat/graphics-preview", "/chat/graphics-sprite"].includes(
            url.pathname,
          )
        ) {
          const id = url.searchParams.get("id");
          const job = playground.jobs.find(
            (j) => j.id === id && j.status === "complete" && j.thumbnails,
          );
          if (!job) throw Error("Frame previews are not ready");
          const directory = path.dirname(playground.overlayArtifact(id));
          if (
            fs.realpathSync(directory) !==
            path.join(fs.realpathSync(workspace), ".editor/playground", id)
          )
            throw Error("Invalid frame preview directory");
          const name =
            url.pathname === "/chat/graphics-preview"
              ? "graphics-thumbnails.json"
              : "graphics-thumbnails.png";
          const file = path.join(directory, name),
            stat = fs.lstatSync(file);
          if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            stat.size > 32 * 1024 * 1024
          )
            throw Error("Invalid frame preview");
          res.setHeader("Cache-Control", "private, max-age=3600");
          if (name.endsWith(".json")) {
            const previews = JSON.parse(fs.readFileSync(file, "utf8"));
            const clipId = url.searchParams.get("clip");
            const preview = Object.hasOwn(previews, clipId)
              ? previews[clipId]
              : null;
            if (!preview) throw Error("No frames for this layer yet");
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ...preview,
                sprite:
                  "/chat/graphics-sprite?" + new URLSearchParams({ id, token }),
              }),
            );
          } else {
            res.setHeader("Content-Type", "image/png");
            res.setHeader("Content-Length", stat.size);
            fs.createReadStream(file).pipe(res);
          }
          return;
        }
        if (["/chat/artifact", "/chat/overlay"].includes(url.pathname)) {
          const id = url.searchParams.get("id");
          const isOverlay = url.pathname === "/chat/overlay";
          const file = isOverlay
            ? playground.overlayArtifact(id)
            : playground.artifact(id);
          if (file) {
            const size = fs.statSync(file).size;
            const range = req.headers.range;
            let start = 0,
              end = size - 1,
              status = 200;
            if (range) {
              const match = /^bytes=(\d*)-(\d*)$/.exec(range);
              if (!match || (!match[1] && !match[2])) {
                res.writeHead(416, { "Content-Range": `bytes */${size}` });
                res.end();
                return;
              }
              start = match[1]
                ? Number(match[1])
                : Math.max(0, size - Number(match[2]));
              end =
                match[1] && match[2]
                  ? Math.min(Number(match[2]), size - 1)
                  : size - 1;
              if (start > end || start >= size) {
                res.writeHead(416, { "Content-Range": `bytes */${size}` });
                res.end();
                return;
              }
              status = 206;
            }
            res.writeHead(status, {
              "Content-Type": isOverlay ? "video/webm" : "video/mp4",
              "Accept-Ranges": "bytes",
              "Content-Length": end - start + 1,
              ...(status === 206
                ? { "Content-Range": `bytes ${start}-${end}/${size}` }
                : {}),
            });
            fs.createReadStream(file, { start, end }).pipe(res);
            return;
          }
          if (isOverlay) throw Error("Graphics preview not ready");
          const r = await fetch(
            connection.url + "/api/artifact?id=" + encodeURIComponent(id),
            { headers: { Authorization: "Bearer " + connection.token } },
          );
          if (!r.ok) throw Error("Preview not ready");
          res.writeHead(200, {
            "Content-Type": "video/mp4",
            "Content-Disposition": "attachment; filename=preview.mp4",
          });
          const { Readable } = await import("node:stream");
          Readable.fromWeb(r.body).pipe(res);
          return;
        }
        if (url.pathname === "/chat/events") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          });
          clients.add(res);
          res.write("data: " + JSON.stringify(state) + "\n\n");
          req.on("close", () => clients.delete(res));
          return;
        }
        if (url.pathname === "/chat/asset-preview") {
          let preview;
          try {
            preview = assets.preview(
              url.searchParams.get("scope"),
              url.searchParams.get("path"),
            );
          } catch (error) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: error.message }));
            return;
          }
          const size = fs.statSync(preview.file).size;
          let start = 0,
            end = size - 1,
            status = 200;
          if (req.headers.range) {
            const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
            if (!m) throw Error("Invalid media range");
            start = Number(m[1]);
            end = m[2] ? Math.min(Number(m[2]), end) : end;
            if (start > end || start >= size) {
              res.writeHead(416, { "Content-Range": `bytes */${size}` });
              res.end();
              return;
            }
            status = 206;
          }
          const ext = path.extname(preview.file).toLowerCase();
          const types = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
            ".bmp": "image/bmp",
            ".svg": "image/svg+xml",
            ".mp4": "video/mp4",
            ".m4v": "video/mp4",
            ".mov": "video/quicktime",
            ".webm": "video/webm",
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".ogg": "audio/ogg",
            ".m4a": "audio/mp4",
            ".flac": "audio/flac",
            ".aac": "audio/aac",
          };
          res.writeHead(status, {
            "Content-Type": types[ext] || "application/octet-stream",
            "Content-Length": end - start + 1,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Content-Security-Policy":
              "sandbox; default-src 'none'; style-src 'unsafe-inline'",
            ...(status === 206
              ? { "Content-Range": `bytes ${start}-${end}/${size}` }
              : {}),
          });
          if (req.method === "HEAD") res.end();
          else
            fs.createReadStream(preview.file, { start, end })
              .on("error", () => res.destroy())
              .pipe(res);
          return;
        }
        if (url.pathname === "/chat/asset-import") {
          if (req.method !== "POST") throw Error("POST required");
          if (!info.selected) throw Error("Choose a project folder first");
          if (locked()) throw Error("An edit or render is still running");
          importing = true;
          reservedImport = true;
          importController = new AbortController();
          state.activity = "Importing asset…";
          state.error = null;
          publish();
          while (activeWrites) await delay(10);
          importTask = importAsset({
            stream: req,
            name: decodeURIComponent(req.headers["x-file-name"] || ""),
            workspace,
            playground,
            editor,
            signal: importController.signal,
            onProgress: (text) => {
              state.activity = text;
              publish();
            },
          });
          let asset;
          try {
            asset = await importTask;
          } finally {
            importTask = null;
            importing = false;
            state.activity = "";
            publish();
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(asset));
          return;
        }
        let body = {};
        if (req.method === "POST") {
          let s = "";
          for await (const c of req) {
            s += c;
            if (s.length > (url.pathname === "/chat/tool" ? 300000 : 64000))
              throw Error("Message too large");
          }
          body = s ? JSON.parse(s) : {};
        }
        let result = { ok: true };
        if (url.pathname === "/chat/state") {
          publish();
          result = state;
        } else if (req.method !== "POST") throw Error("POST required");
        else if (url.pathname === "/chat/draft") {
          if (typeof body.text !== "string" || body.text.length > 20000)
            throw Error("Draft is too long");
          state.draft = body.text;
          fs.writeFileSync(
            draftFile + ".tmp",
            JSON.stringify({ text: body.text }),
            { mode: 0o600 },
          );
          fs.renameSync(draftFile + ".tmp", draftFile);
        } else if (url.pathname === "/chat/tool-ticket") {
          result = { url: agent.ticket(body.id) };
        } else if (url.pathname === "/chat/agent-skill") {
          result = agent.skills.read(body.id);
        } else if (url.pathname === "/chat/agent-settings") {
          result = {
            ...agent.snapshot(),
            ...agent.skills.settings(),
            keyStorage: secretCodec ? "device" : "private-file",
          };
        } else if (url.pathname === "/chat/assets-list") {
          result = { ...assets.list(body), settings: assets.settings() };
        } else if (url.pathname === "/chat/assets-folder") {
          if (locked()) throw Error("Finish the current edit first");
          if (!pickAssetLibrary)
            throw Error("Open the desktop app to choose a library folder");
          const folder = await pickAssetLibrary();
          result = folder ? assets.setFolder(folder) : { canceled: true };
        } else if (url.pathname === "/chat/assets-open") {
          if (!openAssetFolder)
            throw Error("Open the desktop app to open folders");
          await openAssetFolder(assets.root(body.scope || "library"));
          result = { ok: true };
        } else if (
          [
            "/chat/assets-use",
            "/chat/assets-promote",
            "/chat/assets-trash",
          ].includes(url.pathname)
        ) {
          if (locked() || activeWrites)
            throw Error("Finish the current edit first");
          result = url.pathname.endsWith("use")
            ? await assets.use(body)
            : url.pathname.endsWith("promote")
              ? await assets.promote(body.path)
              : await assets.remove(body.scope, body.path);
        } else if (url.pathname === "/chat/action-approve") {
          agent.decide(body.id, body.allowed);
          result = { ok: true };
        } else if (
          [
            "/chat/secret-save",
            "/chat/secret-remove",
            "/chat/connection-save",
            "/chat/connection-remove",
            "/chat/connection-test",
            "/chat/project-notes",
            "/chat/skill-install",
          ].includes(url.pathname)
        ) {
          if (state.busy || state.switching)
            throw Error(
              "Wait for the current turn to finish before changing setup",
            );
          if (url.pathname === "/chat/secret-save") {
            result = { id: agent.secrets.put(body) };
            for (const connection of agent.connections.entries.filter(
              (c) => c.secretId === result.id,
            ))
              await agent.connections.disconnect(connection.id);
          }
          if (url.pathname === "/chat/secret-remove") {
            if (agent.connections.entries.some((e) => e.secretId === body.id))
              throw Error("Remove connections using this key first");
            agent.secrets.remove(body.id);
          }
          if (url.pathname === "/chat/connection-save")
            result = { id: await agent.connections.put(body) };
          if (url.pathname === "/chat/connection-remove")
            await agent.connections.remove(body.id);
          if (url.pathname === "/chat/connection-test")
            result = await agent.connections.test(body.id);
          if (url.pathname === "/chat/project-notes")
            result = agent.skills.write(
              body.file,
              body.text,
              body.scope,
              body.expectedText,
            );
          if (url.pathname === "/chat/skill-install") {
            if (!pickSkill)
              throw Error("Choose a skill folder in the desktop app");
            const folder = await pickSkill();
            if (folder) result = { name: agent.skills.install(folder) };
            else result = { canceled: true };
          }
          publish();
        } else if (url.pathname === "/chat/settings") {
          result = manager.snapshot();
        } else if (url.pathname === "/chat/project") {
          if (locked() || state.switching)
            throw Error("Finish the current edit before changing projects");
          if (!pickProject)
            throw Error("Open the desktop app to choose a project folder");
          state.switching = true;
          publish();
          try {
            result = await pickProject({ recentId: body.recentId });
          } finally {
            state.switching = false;
            publish();
          }
        } else if (url.pathname === "/chat/onboarding") {
          if (body.restart === true) {
            if (locked())
              throw Error("Finish the current work before restarting setup");
            onboarding = {
              complete: false,
              step: info.selected ? "account" : "folder",
            };
          }
          if (body.step !== undefined) {
            if (!["folder", "account", "video"].includes(body.step))
              throw Error("Unknown setup step");
            onboarding.step = body.step;
          }
          if (body.skipProvider === true) onboarding.skipProvider = true;
          if (body.complete === true) {
            if (
              !info.selected ||
              (!state.mediaCount && body.withoutVideo !== true) ||
              (!state.connected && !onboarding.skipProvider)
            )
              throw Error(
                "Choose a project and connect an account (or set it up later), then choose a script or recording",
              );
            onboarding.complete = true;
          }
          fs.writeFileSync(onboardingFile, JSON.stringify(onboarding), {
            mode: 0o600,
          });
          state.onboarding = onboarding;
          publish();
          result = { onboarding };
        } else if (url.pathname === "/chat/model") {
          if (state.busy || state.switching || state.queue.length)
            throw Error(
              "Finish or remove queued messages before changing models",
            );
          state.switching = true;
          publish();
          try {
            await manager.select(body);
            state.error = null;
          } finally {
            state.switching = false;
            publish();
          }
          result = manager.snapshot();
        } else if (url.pathname === "/chat/refresh-provider") {
          const id = body.provider;
          if (!manager.entries.has(id)) throw Error("Unknown provider");
          if (state.busy) throw Error("Wait for the current turn to finish");
          if (!manager.enabled.has(id)) throw Error("Choose Connect first");
          await manager.refresh(id);
          result = manager.snapshot();
        } else if (url.pathname === "/chat/login") {
          const id = body.provider || manager.id;
          if (state.busy) throw Error("Wait for the current turn to finish");
          const login = await manager.login(id, { method: body.method });
          state.error = null;
          publish();
          if (login.authUrl) openExternal(login.authUrl);
          result = { ...manager.snapshot(), url: login.authUrl };
        } else if (url.pathname === "/chat/logout") {
          if (state.busy) throw Error("Wait for the current turn to finish");
          await manager.logout(body.provider || manager.id);
          result = manager.snapshot();
        } else if (url.pathname === "/chat/cancel-login") {
          const id = body.provider;
          if (!manager.entries.has(id)) throw Error("Unknown provider");
          await manager.cancelLogin(id);
          publish();
        } else if (url.pathname === "/chat/tool") {
          if (manager.id !== "claude")
            throw Error("Claude does not own this editing turn");
          result = await onTool(body.name, body.args, "claude");
        } else if (url.pathname === "/chat/send") {
          await ready;
          if (state.switching)
            throw Error("A provider change is still running");
          const text = typeof body.text === "string" ? body.text.trim() : "";
          if (text.length > 20000)
            throw Error("Write a message under 20,000 characters");
          if (
            !Array.isArray(body.comments || []) ||
            (body.comments || []).length > 1000
          )
            throw Error("Invalid comment payload");
          if (
            !Array.isArray(body.assets || []) ||
            (body.assets || []).length > 20
          )
            throw Error("Invalid asset attachments");
          const attachedAssets = (body.assets || []).map((ref) => {
            assets.inspect("project", ref.path);
            return { scope: "project", path: ref.path };
          });
          if (!text && !body.comments?.length && !attachedAssets.length)
            throw Error("Write a message or attach a timed comment");
          if (!manager.enabled.has(manager.id))
            throw Error("Connect a provider in Settings first");
          const current = await editor("/api/context");
          const pending = pendingComments(current.project, [
            ...state.messages,
            ...state.queue,
            ...(activePayload ? [activePayload] : []),
          ]);
          const comments = (body.comments || []).map((c) => {
            const live = pending.find((p) => p.id === c.id);
            if (!live || commentKey(live) !== commentKey(c))
              throw Error(
                "A comment changed. Review the updated notes and send again.",
              );
            return structuredClone(live);
          });
          if (new Set(comments.map((c) => c.id)).size !== comments.length)
            throw Error("Duplicate comments");
          const item = {
            id: randomUUID(),
            role: "user",
            text,
            comments,
            assets: attachedAssets,
            provider: manager.id,
            selection: { ...manager.selected },
          };
          if (
            locked() ||
            playground.running ||
            state.queue.length ||
            state.queuePaused
          ) {
            if (state.queue.length >= 50)
              throw Error("Queue is full. Remove a message first.");
            state.queue.push(item);
            save();
            publish();
            result = { ok: true, queued: true, id: item.id };
          } else {
            result = await startMessage(item);
          }
        } else if (url.pathname === "/chat/queue-remove") {
          state.queue = state.queue.filter((item) => item.id !== body.id);
          save();
          publish();
        } else if (url.pathname === "/chat/queue-resume") {
          if (!state.connected) throw Error("Connect a provider first");
          state.queuePaused = false;
          state.error = null;
          save();
          publish();
        } else if (url.pathname === "/chat/stop") {
          agent.cancel();
          state.queuePaused = true;
          activePayload = null;
          save();
          turnGeneration++;
          playground.cancel();
          importController?.abort();
          if (state.busy) {
            await manager.active.stop();
            if (manager.active.running === false) {
              state.busy = false;
              state.activity = "";
              save();
              publish();
            }
          }
        } else if (url.pathname === "/chat/render") {
          if (locked()) throw Error("An edit or render is still running");
          preparingRender = true;
          reservedRender = true;
          publish();
          while (activeWrites) await delay(10);
          result = await playground.render(
            (await editor("/api/context")).project.revision,
          );
          preparingRender = false;
          publish();
        } else if (url.pathname === "/chat/import") {
          if (locked()) throw Error("An edit or render is still running");
          state.error = null;
          importing = true;
          importController = new AbortController();
          reservedImport = true;
          publish();
          while (activeWrites) await delay(10);
          if (!pickVideo) throw Error("Open the desktop app to choose a video");
          const source = await pickVideo();
          if (source) {
            state.activity = "Preparing your video…";
            publish();
            importTask = importVideo({
              workspace,
              source,
              editor,
              signal: importController.signal,
              onProgress: (text) => {
                state.activity = text;
                publish();
              },
            });
            try {
              result = await importTask;
            } catch (error) {
              if (importController.signal.aborted) result = { canceled: true };
              else throw error;
            } finally {
              importTask = null;
            }
            state.activity = "";
            publish();
          }
          importing = false;
          publish();
        } else throw Error("Unknown chat action");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
        return;
      }
      if (url.pathname === "/") {
        res.setHeader("Content-Type", "text/html");
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self'; media-src 'self'; connect-src 'self'; img-src 'self' data:",
        );
        res.end(fs.readFileSync(path.join(here, "index.html")));
        return;
      }
      if (url.pathname === "/SpaceGrotesk.ttf") {
        res.setHeader("Content-Type", "font/ttf");
        res.end(
          fs.readFileSync(
            path.resolve(here, "../resources/fonts/SpaceGrotesk[wght].ttf"),
          ),
        );
        return;
      }
      if (url.pathname === "/markdown-parser.mjs") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(
          fs.readFileSync(
            path.join(here, "../node_modules/marked/lib/marked.esm.js"),
          ),
        );
        return;
      }
      if (url.pathname.startsWith("/brands/")) {
        const asset = url.pathname.slice("/brands/".length);
        if (!logoAssets.includes(asset)) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.setHeader("Content-Type", "image/png");
        res.end(
          fs.readFileSync(path.resolve(here, "../resources/brands", asset)),
        );
        return;
      }
      if (
        [
          "/chat.js",
          "/chat.css",
          "/editor-theme.css",
          "/message-view.mjs",
          "/comment-payload.mjs",
          "/settings-view.mjs",
          "/brand-ui.mjs",
          "/onboarding.mjs",
          "/agent-settings.mjs",
          "/asset-manager.mjs",
          "/app-polish.css",
          "/dither-art.mjs",
        ].includes(url.pathname)
      ) {
        res.setHeader(
          "Content-Type",
          /\.m?js$/.test(url.pathname) ? "text/javascript" : "text/css",
        );
        res.end(fs.readFileSync(path.join(here, url.pathname.slice(1))));
        return;
      }
      // Serve the unchanged editor and stream media/SSE without buffering. Rewrite only transport origin.
      const mutation =
        req.method !== "GET" &&
        req.method !== "HEAD" &&
        url.pathname.startsWith("/api/") &&
        url.pathname !== "/api/selection";
      if (mutation && locked()) {
        res.writeHead(423, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Timeline is locked while the agent or renderer works.",
          }),
        );
        return;
      }
      if (mutation) {
        activeWrites++;
        res.once("close", () => {
          activeWrites--;
        });
      }
      const target = new URL(connection.url);
      const upstream = request(
        target.origin +
          (url.pathname === "/editor" ? "/" : url.pathname) +
          url.search,
        {
          method: req.method,
          headers: { ...req.headers, host: target.host, origin: target.origin },
        },
        (r) => {
          res.writeHead(r.statusCode, r.headers);
          r.pipe(res);
        },
      );
      upstream.on("error", () => {
        res.writeHead(502);
        res.end("Editor disconnected");
      });
      req.pipe(upstream);
    } catch (e) {
      if (reservedImport) {
        importing = false;
        state.activity = "";
      }
      if (reservedRender) preparingRender = false;
      const message = agent ? agent.secrets.redact(e.message) : e.message;
      state.error = message;
      publish();
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  let lastOverlayAttempt;
  const jobTimer = setInterval(async () => {
    if (closing) return;
    try {
      publish();
      if (
        !locked() &&
        !playground.running &&
        state.queue.length &&
        !state.queuePaused &&
        state.connected
      ) {
        const item = state.queue[0];
        if (item.provider !== manager.id)
          throw Error("Connect the queued message’s provider before resuming.");
        await startMessage(item);
        return;
      }
      if (
        autoPreview &&
        !locked() &&
        !playground.running &&
        playground.hasGraphics()
      ) {
        const fingerprint = playground.fingerprint();
        const overlay = playground.state().overlay;
        if (
          overlay?.fingerprint !== fingerprint &&
          lastOverlayAttempt !== fingerprint
        ) {
          const { project } = await editor("/api/context");
          if (!locked() && !playground.running) {
            lastOverlayAttempt = fingerprint;
            await playground.render(project.revision, { overlayOnly: true });
          }
        }
      }
    } catch (e) {
      state.error = e.message;
      state.queuePaused = true;
      save();
      publish();
    }
  }, 1000);
  const appConnection = {
    url: "http://127.0.0.1:" + server.address().port,
    token,
    editorToken: connection.token,
  };
  fs.writeFileSync(
    path.join(workspace, ".editor/chat-connection.json"),
    JSON.stringify(appConnection),
    { mode: 0o600 },
  );
  return {
    ...appConnection,
    workspace,
    editor,
    playground,
    assets,
    agent,
    manager,
    state,
    publish,
    close: async () => {
      closing = true;
      turnGeneration++;
      clearInterval(jobTimer);
      importController?.abort();
      await importTask?.catch(() => {});
      save();
      manager.close();
      await agent.close();
      child.kill();
      const forceExit = setTimeout(() => child.kill("SIGKILL"), 2000);
      await playground.close();
      await childDone;
      clearTimeout(forceExit);
      for (const c of clients) c.end();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
    ready,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--workspace");
  const app = await startApp({
    workspace: i < 0 ? undefined : process.argv[i + 1],
    port: Number(process.env.CHAT_PORT || 4325),
  });
  console.log("Chat editor ready on " + app.url);
  for (const s of ["SIGINT", "SIGTERM"])
    process.on(s, async () => {
      await app.close();
      process.exit();
    });
}
