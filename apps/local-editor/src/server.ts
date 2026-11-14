import { resolveProject } from "../../../flow/project/resolve.mjs";
import { sourceWindow } from "../../../flow/project/source-index.mjs";
import { jobProjection, publicRenderJob } from "./render-contract.mjs";
import { loadExtensions, extensionHooks } from "./extensions.js";
import { operationTypes, type Operation } from "./operations.js";
import { PlaybackProxies, publicProxy } from "./playback-proxy.mjs";
import fs from "node:fs";
import path from "node:path";
import { createServer, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Workspace, Fault, atomic } from "./workspace.js";
import { validate, clone, type Project } from "./model.js";
import { Renderer, getBoxes, safeFile, type Extension } from "./render.js";
import { MediaPreviews } from "./media-preview.js";
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const root = path.resolve(
    arg("--workspace", path.join(app, "workspaces/demo")),
  ),
  port = Number(arg("--port", "4319"));
if (!fs.existsSync(path.join(root, "project.json")))
  throw Error(`No project.json in ${root}. Run npm run demo first.`);
fs.mkdirSync(path.join(root, ".editor"), { recursive: true });
const lock = path.join(root, ".editor", "server.lock");
try {
  fs.mkdirSync(lock);
} catch {
  let recovered = false;
  if (process.env.EDITOR_RECOVER_STALE_LOCK === "1") {
    try {
      const owner = Number(fs.readFileSync(path.join(lock, "pid"), "utf8"));
      if (Number.isSafeInteger(owner) && owner > 1) {
        try {
          process.kill(owner, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") {
            fs.rmSync(lock, { recursive: true });
            fs.mkdirSync(lock);
            recovered = true;
          }
        }
      }
    } catch {}
  }
  if (!recovered)
    throw Error(
      `Workspace already locked. Close its editor before reopening ${root}`,
    );
}
fs.writeFileSync(path.join(lock, "pid"), String(process.pid));
let extensions: Extension[];
try {
  extensions = await loadExtensions(
    process.env.EDITOR_DISABLE_EXTENSIONS === "1"
      ? []
      : [path.join(app, "extensions"), path.join(root, "extensions")],
  );
} catch (e) {
  fs.rmSync(lock, { recursive: true });
  throw e;
}
let workspace: Workspace;
try {
  workspace = new Workspace(root, extensionHooks(extensions));
} catch (e) {
  fs.rmSync(lock, { recursive: true });
  throw e;
}
const token = randomBytes(32).toString("hex"),
  clients = new Set<ServerResponse>();
let selection: unknown = null;
const selectionFile = path.join(root, ".editor/view.json");
try {
  selection = JSON.parse(fs.readFileSync(selectionFile, "utf8"));
} catch {}
let renderer: Renderer;
function state() {
  const resolution = resolveProject(workspace.project);
  let boxes = {};
  let extensionError = "";
  try {
    boxes = getBoxes(resolution.project as Project, extensions);
  } catch (e) {
    extensionError = (e as Error).message;
  }
  return {
    project: workspace.project,
    resolution,
    transactions: (workspace.state.receipts ?? []).slice(-20),
    latestTransaction: workspace.state.receipts?.at(-1) ?? null,
    error: workspace.error || extensionError,
    boxes,
    canUndo: workspace.state.cursor > 0,
    canRedo: workspace.state.cursor < workspace.state.history.length - 1,
    undoLabel:
      workspace.state.receipts?.find(
        (r) =>
          r.revision ===
          workspace.state.history[workspace.state.cursor]?.revision,
      )?.label ?? null,
    redoLabel:
      workspace.state.receipts?.find(
        (r) =>
          r.revision ===
          workspace.state.history[workspace.state.cursor + 1]?.revision,
      )?.label ?? null,
    jobs: (renderer?.jobs ?? []).map(publicRenderJob),
    renderJobs: (renderer?.jobs ?? []).map(jobProjection),
    extensions: extensions.map((e) => e.manifest),
    selection,
  };
}
function broadcast() {
  const data = `data: ${JSON.stringify(state())}\n\n`;
  for (const c of clients) c.write(data);
}
renderer = new Renderer(root, extensions, broadcast);
const mediaPreviews = new MediaPreviews(root);
const playbackProxies = new PlaybackProxies(
  path.join(root, ".editor/playback-proxies"),
);
workspace.on("change", broadcast);
function send(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
function stream(res: ServerResponse, file: string, range: string | undefined) {
  const stat = fs.statSync(file),
    ext = path.extname(file),
    mime: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".mjs": "text/javascript",
      ".css": "text/css",
      ".ttf": "font/ttf",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".wav": "audio/wav",
    };
  const headers = {
    "Content-Type": mime[ext] || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  let start = 0,
    finish = stat.size - 1;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2])) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    if (m[1]) {
      start = Number(m[1]);
      finish = m[2] ? Math.min(Number(m[2]), finish) : finish;
    } else start = Math.max(0, stat.size - Number(m[2]));
    if (start > finish || start >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
  }
  res.writeHead(range ? 206 : 200, {
    ...headers,
    "Content-Length": finish - start + 1,
    ...(range
      ? { "Content-Range": `bytes ${start}-${finish}/${stat.size}` }
      : {}),
  });
  fs.createReadStream(file, { start, end: finish })
    .on("error", () => res.destroy())
    .pipe(res);
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1`),
      route = url.pathname;
    const host = req.headers.host || "";
    if (
      host !== `127.0.0.1:${actualPort}` &&
      host !== `localhost:${actualPort}`
    )
      throw new Fault(403, "Invalid Host");
    const origin = req.headers.origin;
    const authorized =
      req.headers.authorization === `Bearer ${token}` ||
      url.searchParams.get("token") === token;
    const sandboxRequest =
      origin === "null" && route.startsWith("/api/") && authorized;
    if (origin && origin !== `http://${host}` && !sandboxRequest)
      throw new Fault(403, "Cross-origin requests are disabled");
    if (sandboxRequest) {
      res.setHeader("Access-Control-Allow-Origin", "null");
      res.setHeader("Vary", "Origin");
    }
    if (route.startsWith("/api/") && !authorized)
      throw new Fault(401, "Open the launcher URL to connect");
    if (route === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      clients.add(res);
      res.write(`data: ${JSON.stringify(state())}\n\n`);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (req.method === "GET") {
      if (route === "/api/state" || route === "/api/context") {
        workspace.poll();
        send(res, {
          ...state(),
          ...(route.endsWith("context")
            ? {
                workspace: root,
                projectFile: "project.json",
                contract:
                  "Use expected revision for mutations. Local scripts may edit files; watch errors before continuing.",
              }
            : {}),
        });
        return;
      }
      if (route === "/api/source-window") {
        const asset = workspace.project.assets.find(
          (a) => a.id === url.searchParams.get("id"),
        );
        if (!asset) throw new Fault(404, "Asset not found");
        const start = Number(url.searchParams.get("start") ?? 0),
          duration = Number(url.searchParams.get("duration") ?? 30);
        if (
          !Number.isFinite(start) ||
          start < 0 ||
          start >= asset.duration ||
          !Number.isFinite(duration) ||
          duration <= 0 ||
          duration > 120
        )
          throw new Fault(400, "Choose a source window of up to 120 seconds");
        const preview = await mediaPreviews.get(asset, { start, duration });
        send(res, sourceWindow(asset, preview, { start, duration }));
        return;
      }
      if (route === "/api/media-preview") {
        const asset = workspace.project.assets.find(
          (a) => a.id === url.searchParams.get("id"),
        );
        if (!asset) throw new Fault(404, "Asset not found");
        const window = url.searchParams.has("start")
          ? {
              start: Number(url.searchParams.get("start")),
              duration: Number(url.searchParams.get("duration")),
            }
          : undefined;
        if (
          window &&
          (!Number.isFinite(window.start) ||
            window.start < 0 ||
            window.start >= asset.duration ||
            !Number.isFinite(window.duration) ||
            window.duration <= 0 ||
            window.duration > 601)
        )
          throw new Fault(400, "Invalid timeline source window");
        send(res, await mediaPreviews.get(asset, window));
        return;
      }
      if (route === "/api/playback-preview") {
        const asset = workspace.project.assets.find(
          (a) => a.id === url.searchParams.get("id"),
        );
        if (!asset) throw new Fault(404, "Asset not found");
        send(
          res,
          publicProxy(
            playbackProxies.request(
              safeFile(root, asset.path),
              url.searchParams.get("quality"),
              false,
              url.searchParams.get("retry") === "1",
              url.searchParams.get("refresh") === "1",
            ),
          ),
        );
        return;
      }
      if (route === "/api/media") {
        const asset = workspace.project.assets.find(
          (a) => a.id === url.searchParams.get("id"),
        );
        if (!asset) throw new Fault(404, "Asset not found");
        let file = safeFile(root, asset.path);
        if (url.searchParams.has("quality")) {
          const preview = playbackProxies.request(
            file,
            url.searchParams.get("quality"),
          );
          if (preview.status === "ready") file = preview.file;
        }
        stream(res, file, req.headers.range);
        return;
      }
      if (route === "/api/artifact") {
        const job = renderer.jobs.find(
          (j) => j.id === url.searchParams.get("id"),
        );
        if (!job?.artifact) throw new Fault(404, "Artifact not available");
        stream(res, safeFile(root, job.artifact), req.headers.range);
        return;
      }
      if (route.startsWith("/api/extension/")) {
        const ext = extensions.find(
          (e) => e.manifest.id === route.split("/").pop(),
        );
        if (!ext?.manifest.browser) throw new Fault(404, "No panel");
        stream(res, safeFile(ext.dir, ext.manifest.browser), undefined);
        return;
      }
      if (route === "/embed") {
        // Inline bundled assets: opaque sandbox origins cannot load same-origin ES modules.
        const publicDir = path.join(app, "dist/public");
        const script = fs
          .readFileSync(path.join(publicDir, "app.js"), "utf8")
          .replaceAll("</script", "<\\/script");
        const css = fs
          .readFileSync(path.join(publicDir, "app.css"), "utf8")
          .replace(/@font-face\s*\{[^}]*\}/g, "");
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        });
        res.end(
          `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root">Connecting editor…</div><script type="module">${script}</script></body></html>`,
        );
        return;
      }
      const file = route === "/" ? "index.html" : route.slice(1);
      stream(res, safeFile(path.join(app, "dist/public"), file), undefined);
      return;
    }
    if (req.method !== "POST") throw new Fault(405, "Method not allowed");
    if (!route.startsWith("/api/")) throw new Fault(404, "Not found");
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 2e6) throw new Fault(413, "Request too large");
    }
    const body = JSON.parse(raw || "{}");
    let value: unknown;
    const operationType = route.slice("/api/".length);
    if (operationTypes.includes(operationType as Operation["type"])) {
      const result = workspace.transact(
        body.revision,
        [{ ...body, type: operationType } as Operation],
        {
          operationId: body.operationId,
          actor: body.actor ?? "client",
          label:
            body.label ??
            {
              clip: "Adjust clip",
              layer: "Update layer",
              project: "Replace document",
              split: "Split clip",
              "ripple-delete": "Remove time",
              add: "Add footage",
              "add-graphics": "Add graphics",
              comment: "Add comment",
              "comment-update": "Update comment",
              transcript: "Update transcript",
              "take-choice": "Choose take",
              delete: "Delete clip",
              extension: "Extension command",
            }[operationType] ??
            operationType,
        },
      );
      res.setHeader("X-Operation-Id", result.receipt.operationId);
      value = result.project;
    } else
      switch (route) {
        case "/api/operations":
          value = workspace.transact(body.revision, body.operations, body);
          break;
        case "/api/undo":
          value = workspace.travel(body.revision, -1, body);
          break;
        case "/api/redo":
          value = workspace.travel(body.revision, 1, body);
          break;
        case "/api/render":
          workspace.ensure(body.revision);
          value = publicRenderJob(renderer.start(workspace.project));
          break;
        case "/api/cancel":
          renderer.cancel(body.id);
          value = { ok: true };
          break;
        case "/api/selection":
          if (
            !Number.isFinite(body.time) ||
            body.time < 0 ||
            (body.clipId != null && typeof body.clipId !== "string")
          )
            throw Error("Invalid selection");
          selection = { clipId: body.clipId, time: body.time };
          fs.writeFileSync(selectionFile + ".tmp", JSON.stringify(selection), {
            mode: 0o600,
          });
          fs.renameSync(selectionFile + ".tmp", selectionFile);
          value = { ok: true };
          break;
        case "/api/tool": {
          value = workspace.transact(
            body.revision,
            [{ type: "extension", name: body.name }],
            {
              actor: body.actor ?? "client",
              label: body.name,
              operationId: body.operationId,
            },
          ).project;
          break;
        }
        default:
          throw new Fault(404, "Unknown operation");
      }
    send(res, value);
    broadcast();
  } catch (e) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const error = e as Error;
    send(
      res,
      {
        error: error.message,
        ...(e instanceof Fault
          ? (e.details ?? {})
          : { code: "invalid_request" }),
      },
      e instanceof Fault ? e.status : 400,
    );
  }
});
let actualPort = port;
server.on("error", (e) => {
  console.error(e);
  shutdown();
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  actualPort = (server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${actualPort}`;
  atomic(path.join(root, ".editor", "connection.json"), {
    url,
    token,
    pid: process.pid,
  });
  fs.chmodSync(path.join(root, ".editor", "connection.json"), 0o600);
  console.log(
    `\nCMRX Local Editor MVP\nWorkspace: ${root}\nOpen: ${url}/#token=${token}\n`,
  );
});
const heartbeat = setInterval(() => {
  for (const c of clients) c.write(": heartbeat\n\n");
}, 15000);
const parentPid = Number(process.env.EDITOR_PARENT_PID || 0);
const parentWatch =
  Number.isSafeInteger(parentPid) && parentPid > 1
    ? setInterval(() => {
        try {
          process.kill(parentPid, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") {
            shutdown();
            process.exit(0);
          }
        }
      }, 1000)
    : undefined;
parentWatch?.unref();
let stopped = false;
function shutdown() {
  if (stopped) return;
  stopped = true;
  clearInterval(heartbeat);
  if (parentWatch) clearInterval(parentWatch);
  workspace.close();
  renderer.close();
  mediaPreviews.close();
  void playbackProxies.close();
  for (const c of clients) c.end();
  server.close();
  fs.rmSync(lock, { recursive: true, force: true });
  fs.rmSync(path.join(root, ".editor", "connection.json"), { force: true });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
