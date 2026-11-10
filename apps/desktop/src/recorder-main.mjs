import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { RecordingStore, recoverRecordings } from "./recording-store.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
export function createRecorder({
  BrowserWindow,
  ipcMain,
  session,
  desktopCapturer,
  systemPreferences,
  globalShortcut,
  shell,
  parent,
}) {
  let win,
    owner,
    writer,
    phase = "setup",
    pendingSource,
    stopWait;
  const captureSession = session.fromPartition("cmrx-recorder");
  const trusted = (wc) => win && !win.isDestroyed() && wc === win.webContents;
  captureSession.setPermissionRequestHandler((wc, permission, callback) =>
    callback(trusted(wc) && ["media", "display-capture"].includes(permission)),
  );
  captureSession.setPermissionCheckHandler(
    (wc, permission) =>
      trusted(wc) && ["media", "display-capture"].includes(permission),
  );
  captureSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      if (!win || request.frame !== win.webContents.mainFrame)
        return callback(null);
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          thumbnailSize: { width: 240, height: 140 },
        });
        if (!sources.length) return callback(null);
        if (sources.length === 1) return callback({ video: sources[0] });
        pendingSource = { callback, sources };
        win.webContents.send(
          "recording:sources",
          sources.map((s) => ({
            id: s.id,
            name: s.name,
            thumbnail: s.thumbnail.toDataURL(),
          })),
        );
      } catch {
        callback(null);
      }
    },
    { useSystemPicker: process.platform === "darwin" },
  );
  function stop() {
    if (win && !win.isDestroyed()) win.webContents.send("recording:stop");
  }
  ipcMain.handle("recording:command", async (event, action, data = {}) => {
    if (
      !trusted(event.sender) ||
      event.senderFrame !== win.webContents.mainFrame
    )
      throw Error("Unavailable");
    if (action === "info")
      return {
        project: owner.name,
        platform: process.platform,
        interrupted: recoverRecordings(owner.workspace).length,
      };
    if (action === "layout") {
      if (
        ![
          "setup",
          "capture",
          "saving",
          "complete",
          "interrupted",
          "sources",
        ].includes(data.view)
      )
        return;
      const compact = ["capture", "saving"].includes(data.view);
      const width = data.view === "sources" ? 680 : compact ? 340 : 460;
      const height =
        data.view === "sources"
          ? 520
          : Math.max(120, Math.min(640, Number(data.height) || 360));
      const [currentWidth, currentHeight] = win.getContentSize();
      if (width !== currentWidth || height !== currentHeight)
        win.setContentSize(width, height);
      return;
    }
    if (action === "permission") {
      if (!["camera", "microphone"].includes(data.kind))
        throw Error("Unknown capture device");
      if (process.platform === "darwin") {
        const key =
          data.kind === "camera"
            ? "NSCameraUsageDescription"
            : "NSMicrophoneUsageDescription";
        const plist = path.resolve(
          path.dirname(process.execPath),
          "../Info.plist",
        );
        if (
          spawnSync(
            "/usr/bin/plutil",
            ["-extract", key, "raw", "-o", "-", plist],
            { stdio: "ignore" },
          ).status !== 0
        )
          throw Error(
            "This app build is missing " +
              data.kind +
              " permission metadata. Screen-only recording is still available.",
          );
        if (!(await systemPreferences.askForMediaAccess(data.kind)))
          throw Error(
            "Allow " + data.kind + " access in system privacy settings.",
          );
      }
      return true;
    }
    if (action === "source") {
      if (!pendingSource) throw Error("No screen selection pending");
      const { sources, callback } = pendingSource;
      pendingSource = null;
      const source = sources.find((s) => s.id === data.id);
      callback(source ? { video: source } : null);
      return;
    }
    if (action === "begin") {
      if (writer) throw Error("This recording has already started");
      writer = new RecordingStore(owner.workspace);
      await writer.start(data.tracks);
      phase = "recording";
      const registered = globalShortcut.register(
        "CommandOrControl+Shift+F9",
        stop,
      );
      return { shortcut: registered ? "Ctrl/⌘ + Shift + F9" : null };
    }
    if (action === "chunk") return writer?.write(data.name, data.bytes);
    if (action === "finish") {
      if (!writer) throw Error("No recording");
      phase = "saving";
      try {
        const result = await writer.finish(data.offsets);
        phase = "complete";
        globalShortcut.unregister("CommandOrControl+Shift+F9");
        stopWait?.();
        stopWait = null;
        return result;
      } catch (e) {
        globalShortcut.unregister("CommandOrControl+Shift+F9");
        phase = "interrupted";
        stopWait?.();
        stopWait = null;
        throw e;
      }
    }
    if (action === "interrupt") {
      try {
        await writer?.interrupt(
          String(data.reason || "Recording interrupted").slice(0, 500),
        );
      } finally {
        phase = "interrupted";
        globalShortcut.unregister("CommandOrControl+Shift+F9");
        stopWait?.();
        stopWait = null;
      }
      return;
    }
    if (action === "recovery") {
      if (recoverRecordings(owner.workspace).length)
        await shell.openPath(path.join(owner.workspace, ".editor/recordings"));
      return;
    }
    if (action === "folder") {
      if (writer) await shell.openPath(writer.folder);
      return;
    }
    if (action === "close") {
      win.close();
      return;
    }
    throw Error("Unknown recorder action");
  });
  return {
    open(project) {
      if (win && !win.isDestroyed()) {
        if (owner.workspace !== project.workspace)
          throw Error("A recorder is already open for " + owner.name);
        win.show();
        win.focus();
        return;
      }
      owner = { name: project.name, workspace: project.workspace };
      writer = null;
      phase = "setup";
      win = new BrowserWindow({
        width: 460,
        height: 380,
        minWidth: 320,
        minHeight: 120,
        resizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        title: "Record · " + project.name,
        parent,
        backgroundColor: "#121214",
        webPreferences: {
          preload: path.join(here, "recorder-preload.cjs"),
          partition: "cmrx-recorder",
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          backgroundThrottling: false,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e) => e.preventDefault());
      win.on("close", (e) => {
        if (["recording", "saving"].includes(phase)) {
          e.preventDefault();
          stop();
        }
      });
      win.on("closed", () => {
        if (pendingSource) {
          pendingSource.callback(null);
          pendingSource = null;
        }
        globalShortcut.unregister("CommandOrControl+Shift+F9");
        if (writer && phase !== "complete")
          void writer.interrupt("Recorder window closed").catch(console.error);
        win = null;
      });
      win.webContents.on("render-process-gone", () => {
        phase = "interrupted";
        void writer?.interrupt("Recorder process stopped").catch(console.error);
        stopWait?.();
        stopWait = null;
      });
      win.loadFile(path.join(here, "recorder.html"));
    },
    async shutdown() {
      if (!win || win.isDestroyed()) return;
      if (["recording", "saving"].includes(phase)) {
        await new Promise((resolve) => {
          const timer = setTimeout(async () => {
            try {
              await writer?.interrupt("App closed before saving finished");
            } catch (error) {
              console.error(error);
            } finally {
              resolve();
            }
          }, 120000);
          stopWait = () => {
            clearTimeout(timer);
            resolve();
          };
          stop();
        });
      }
      if (win && !win.isDestroyed()) win.destroy();
    },
  };
}
