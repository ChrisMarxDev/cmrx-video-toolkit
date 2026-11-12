const {
  app,
  BrowserWindow,
  WebContentsView,
  dialog,
  shell,
  safeStorage,
  ipcMain,
  Menu,
  session: electronSession,
  desktopCapturer,
  systemPreferences,
  globalShortcut,
} = require("electron");
const path = require("node:path");
let win,
  quitting = false,
  timer;
const entries = [];
let enabled;
let active = null,
  utility = null,
  overlay = false,
  settingsOnly = false;
const rootFile = path.join(__dirname, "desktop-shell.html");
if (process.env.CHAT_DEBUG_PORT)
  app.commandLine.appendSwitch(
    "remote-debugging-port",
    process.env.CHAT_DEBUG_PORT,
  );
app.setName("CMRX Chat Editor");
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(async () => {
    try {
      if (process.platform === "darwin")
        app.dock.setIcon(path.resolve(__dirname, "../resources/app-icon.png"));
      app.setAboutPanelOptions({
        applicationName: "CMRX Chat Editor",
        applicationVersion: app.getVersion(),
        copyright: "CMRX",
        iconPath: path.resolve(__dirname, "../resources/app-icon.png"),
      });

      if (process.platform === "darwin") {
        Menu.setApplicationMenu(
          Menu.buildFromTemplate([
            { role: "appMenu", label: "CMRX Chat Editor" },
            { role: "fileMenu" },
            { role: "editMenu" },
            { role: "viewMenu" },
            { role: "windowMenu" },
            {
              label: "Help",
              submenu: [
                {
                  label: "CMRX Chat Editor releases",
                  click: () =>
                    shell.openExternal(
                      "https://github.com/ChrisMarxDev/cmrx-video-toolkit/releases",
                    ),
                },
                {
                  label: "Report an issue",
                  click: () =>
                    shell.openExternal(
                      "https://github.com/ChrisMarxDev/cmrx-video-toolkit/issues",
                    ),
                },
              ],
            },
          ]),
        );
      }
      const { configureBundledEngine } = await import("./bundled-engine.mjs");
      configureBundledEngine({
        root: path.resolve(__dirname, "../../.."),
        data: app.getPath("userData"),
      });
      const { startApp } = await import("./server.mjs");
      const { ProjectLibrary } = await import("./project-library.mjs");
      const { WorkspaceLibrary } = await import("./workspace-library.mjs");
      const { DesktopSession, RenderQueue } =
        await import("./desktop-session.mjs");
      const { SavedConnections } = await import("./saved-connections.mjs");
      enabled = new SavedConnections(app.getPath("userData"));
      const library = new ProjectLibrary(app.getPath("userData")),
        session = new DesktopSession(app.getPath("userData")),
        renderQueue = new RenderQueue();
      const defaults =
        process.env.CHAT_WORKSPACE_DIR ||
        process.env.CHAT_PROJECTS_DIR ||
        path.join(app.getPath("documents"), "CMRX Workspace");
      const workspaces = new WorkspaceLibrary(
        app.getPath("userData"),
        defaults,
      );
      const factory = process.env.CHAT_DESKTOP_TEST_PROVIDER
        ? (
            await import(
              require("node:url").pathToFileURL(
                process.env.CHAT_DESKTOP_TEST_PROVIDER,
              )
            )
          ).default
        : undefined;
      win = new BrowserWindow({
        width: 1440,
        height: 950,
        minWidth: 900,
        minHeight: 640,
        backgroundColor: "#151417",
        title: "Editing room",
        ...(process.platform === "darwin"
          ? { titleBarStyle: "hidden", trafficLightPosition: { x: 16, y: 16 } }
          : {}),
        icon: path.resolve(__dirname, "../resources/app-icon.png"),
        webPreferences: {
          preload: path.join(__dirname, "desktop-preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      win.removeMenu();
      const all = () => [...entries, ...(utility ? [utility] : [])];
      const current = () => entries.find((e) => e.project.id === active);
      const persist = () =>
        session.save(
          entries.map((e) => e.project),
          current()?.project.folder || null,
        );
      function layout() {
        const bounds = win.getContentBounds();
        for (const e of all())
          e.view.setBounds({
            x: 0,
            y: 46,
            width: bounds.width,
            height: Math.max(0, bounds.height - 46),
          });
      }
      function show() {
        for (const e of all())
          e.view.setVisible(
            !overlay && (settingsOnly ? e === utility : e === current()),
          );
        layout();
        win.setTitle(
          current()
            ? current().project.name + " · Editing room"
            : "Editing room",
        );
      }
      function status(e) {
        const s = e.service.state;
        if (s.error || (s.queuePaused && s.queue.length) || s.approvals?.length)
          return "attention";
        if (s.busy || s.importing || e.service.playground.running)
          return "working";
        return e.done ? "done" : "";
      }
      function publish() {
        if (!win || win.isDestroyed()) return;
        win.webContents.send("projects:state", {
          tabs: entries.map((e) => ({
            id: e.project.id,
            name: e.project.name,
            folder: e.project.folder,
            status: status(e),
            activity: e.service.state.activity,
          })),
          active,
          workspace: workspaces.current,
          workspaces: workspaces.list(),
          workspaceProjects: workspaces.projects(),
          recents: library
            .list()
            .filter(
              (p) => !entries.some((e) => e.project.workspace === p.workspace),
            ),
        });
      }
      function secure(contents, origin) {
        contents.setWindowOpenHandler(({ url }) => {
          try {
            const u = new URL(url);
            if (
              u.protocol === "https:" ||
              (u.protocol === "http:" &&
                ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
            )
              shell.openExternal(url).catch(() => {});
          } catch {}
          return { action: "deny" };
        });
        contents.on("will-navigate", (event, url) => {
          if (new URL(url).origin !== origin) event.preventDefault();
        });
        contents.on("before-input-event", (event, input) => {
          if (input.type !== "keyDown") return;
          const mod =
            process.platform === "darwin" ? input.meta : input.control;
          if (!mod) return;
          const key = input.key.toLowerCase();
          if (key === "tab") {
            event.preventDefault();
            const i = entries.findIndex((e) => e.project.id === active);
            if (entries.length)
              select(
                entries[
                  (i + (input.shift ? -1 : 1) + entries.length) % entries.length
                ].project.id,
              );
          }
          if (key === "w") {
            event.preventDefault();
            serialize(() => closeTab(active));
          }
          if (key === "o" || key === "n") {
            event.preventDefault();
            win.webContents.send("projects:shortcut", key);
            overlay = true;
            show();
          }
        });
      }
      secure(win.webContents, "file://");
      const { createRecorder } = await import("./recorder-main.mjs");
      const recorder = createRecorder({
        BrowserWindow,
        ipcMain,
        session: electronSession,
        desktopCapturer,
        systemPreferences,
        globalShortcut,
        shell,
        parent: win,
      });
      async function createEntry(project, isUtility = false) {
        const view = new WebContentsView({
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            backgroundThrottling: false,
          },
        });
        const service = await startApp({
          workspace: project.workspace,
          record: isUtility ? undefined : () => recorder.open(project),
          workspaceRoot: isUtility
            ? undefined
            : project.workspaceRoot || workspaces.ensure().folder,
          projectInfo: { ...project, selected: !isUtility },
          desktopTabs: true,
          autoPreview: () => !isUtility && active === project.id,
          renderQueue,
          sharedEnabled: enabled,
          home: path.join(app.getPath("userData"), "accounts/codex"),
          claudeHome: path.join(app.getPath("userData"), "accounts/claude"),
          agentRoot: path.join(app.getPath("userData"), "agent"),
          providerFactory: factory,
          secretCodec:
            (process.platform === "darwin" ||
              safeStorage.isEncryptionAvailable()) &&
            (process.platform !== "linux" ||
              safeStorage.getSelectedStorageBackend() !== "basic_text")
              ? {
                  // On macOS, checking availability can itself open a Keychain
                  // prompt. Defer access until a key is actually saved or used.
                  encrypt: (v) => {
                    if (!safeStorage.isEncryptionAvailable())
                      throw Error(
                        "Device key storage is unavailable. Unlock your login Keychain and try again.",
                      );
                    return safeStorage.encryptString(v).toString("base64");
                  },
                  decrypt: (v) => {
                    if (!safeStorage.isEncryptionAvailable())
                      throw Error(
                        "Device key storage is unavailable. Unlock your login Keychain and try again.",
                      );
                    return safeStorage.decryptString(Buffer.from(v, "base64"));
                  },
                }
              : undefined,
          pickVideo: async () => {
            const r = await dialog.showOpenDialog(win, {
              title: "Add to timeline",
              properties: ["openFile"],
              filters: [
                {
                  name: "Video",
                  extensions: ["mp4", "mov", "mkv", "webm", "m4v"],
                },
              ],
            });
            return r.canceled ? null : r.filePaths[0];
          },
          pickSkill: async () => {
            const r = await dialog.showOpenDialog(win, {
              title: "Add a skill folder",
              properties: ["openDirectory"],
            });
            return r.canceled ? null : r.filePaths[0];
          },
          pickAssetLibrary: async () => {
            const r = await dialog.showOpenDialog(win, {
              title: "Choose asset library",
              properties: ["openDirectory", "createDirectory"],
            });
            return r.canceled ? null : r.filePaths[0];
          },
          openAssetFolder: async (folder) => {
            const error = await shell.openPath(folder);
            if (error) throw Error(error);
          },
          trashAsset: (file) => shell.trashItem(file),
          openExternal: (url) => {
            if (new URL(url).protocol === "https:")
              shell.openExternal(url).catch(() => {});
          },
        });
        const e = { project, service, view, syncing: new Set() };
        win.contentView.addChildView(view);
        view.setVisible(false);
        secure(view.webContents, service.url);
        try {
          await view.webContents.loadURL(
            service.url +
              "/#" +
              new URLSearchParams({
                token: service.token,
                editorToken: service.editorToken,
              }),
          );
        } catch (error) {
          await service.close();
          win.contentView.removeChildView(view);
          view.webContents.close();
          throw error;
        }
        if (isUtility)
          await view.webContents.executeJavaScript(
            "document.querySelector('main').style.display='none'",
          );
        view.webContents.on("render-process-gone", () => {
          e.service.state.error =
            "Project view stopped. Close and reopen this tab.";
          publish();
        });
        return e;
      }
      function select(id) {
        const previous = current();
        active = id;
        if (current()?.project.workspaceRoot)
          workspaces.select(current().project.workspaceRoot);
        settingsOnly = false;
        if (previous && previous !== current()) {
          if (
            previous.service.playground.running &&
            !previous.service.playground.blocking
          )
            previous.service.playground.cancel();
          previous.view.webContents
            .executeJavaScript(
              `document.querySelector('#editor')?.contentWindow?.postMessage({type:'cmrx-pause'},location.origin)`,
            )
            .catch(() => {});
        }
        if (current()) current().done = false;
        show();
        persist();
        publish();
      }
      async function open(project) {
        project.workspaceRoot ||= workspaces.ensure().folder;
        let e = entries.find((e) => e.project.workspace === project.workspace);
        if (!e) {
          e = await createEntry(project);
          entries.push(e);
        }
        select(e.project.id);
        return e;
      }
      async function closeTab(id) {
        const e = entries.find((e) => e.project.id === id);
        if (!e) return;
        const s = e.service.state;
        if (
          s.locked ||
          s.busy ||
          e.service.playground.running ||
          s.queue?.length
        ) {
          const r = await dialog.showMessageBox(win, {
            type: "question",
            message: "Stop work and close " + e.project.name + "?",
            detail:
              "The project stays saved. Running work will stop; waiting messages remain paused when reopened.",
            buttons: ["Keep open", "Stop and close"],
            defaultId: 0,
            cancelId: 0,
          });
          if (r.response !== 1) return;
        }
        const index = entries.indexOf(e);
        entries.splice(index, 1);
        if (active === id)
          active = entries[Math.max(0, index - 1)]?.project.id || null;
        show();
        persist();
        publish();
        await e.service.close();
        win.contentView.removeChildView(e.view);
        e.view.webContents.close();
      }
      let commands = Promise.resolve();
      function serialize(fn) {
        const p = commands.then(fn);
        commands = p.catch(() => {});
        return p;
      }
      async function settings() {
        overlay = false;
        if (current()) {
          settingsOnly = false;
          show();
          await current().view.webContents.executeJavaScript(
            `document.querySelector('[aria-label="Open settings"]').click()`,
          );
        } else {
          if (!utility)
            utility = await createEntry(
              {
                name: "Settings",
                workspace: path.join(app.getPath("userData"), "settings"),
              },
              true,
            );
          settingsOnly = true;
          show();
          await utility.view.webContents.executeJavaScript(
            `document.querySelector('[aria-label="Open settings"]').click()`,
          );
        }
        publish();
      }
      ipcMain.handle("projects:command", (event, action, data = {}) => {
        if (event.sender !== win.webContents) throw Error("Unavailable");
        return serialize(async () => {
          if (action === "state") {
            publish();
            return;
          }
          if (action === "menu" || action === "overlay") {
            overlay = !!data.open;
            show();
            return;
          }
          if (action === "settings") return settings();
          if (action === "select") {
            if (!entries.some((e) => e.project.id === data.id))
              throw Error("Project is not open");
            select(data.id);
            return;
          }
          if (action === "close") return closeTab(data.id);
          if (action === "workspace-open" || action === "workspace-create") {
            let folder = data.folder;
            if (folder && !workspaces.list().some((w) => w.folder === folder))
              throw Error("Choose a known workspace or use the folder picker");
            if (!folder) {
              const r = await dialog.showOpenDialog(win, {
                title:
                  action === "workspace-create"
                    ? "Choose a folder for your workspace"
                    : "Open workspace",
                properties:
                  action === "workspace-create"
                    ? ["openDirectory", "createDirectory"]
                    : ["openDirectory"],
              });
              if (r.canceled) return;
              folder = r.filePaths[0];
            }
            workspaces.select(folder, {
              create: action === "workspace-create",
            });
            active = null;
            settingsOnly = false;
            show();
            persist();
            publish();
            return;
          }
          if (action === "workspace-show") {
            const w = workspaces.ensure();
            await shell.openPath(w.folder);
            return;
          }
          if (action === "create") {
            // First creation chooses the workspace; no creative files go in the app profile.
            if (
              !workspaces.current &&
              !workspaces.saved.folder &&
              !process.env.CHAT_PROJECTS_DIR &&
              !process.env.CHAT_WORKSPACE_DIR
            ) {
              const r = await dialog.showOpenDialog(win, {
                title: "Choose a folder for your workspace",
                properties: ["openDirectory", "createDirectory"],
              });
              if (r.canceled) return { canceled: true };
              workspaces.select(r.filePaths[0], { create: true });
            }
            const owner = workspaces.ensure();
            const p = library.create(
              path.join(owner.folder, "projects"),
              data.name,
            );
            await open(p);
            return;
          }
          if (action === "open") {
            let project;
            if (data.recentId) project = library.recent(data.recentId);
            else if (data.folder) {
              if (!workspaces.projects().some((p) => p.folder === data.folder))
                throw Error("Choose a workspace project");
              project = library.open(data.folder);
            } else {
              const r = await dialog.showOpenDialog(win, {
                title: "Open project folder",
                properties: ["openDirectory"],
              });
              if (r.canceled) return;
              const folder = r.filePaths[0];
              if (
                require("node:fs").existsSync(
                  path.join(folder, "workspace.yaml"),
                )
              ) {
                workspaces.select(folder);
                publish();
                return;
              }
              project = library.open(folder);
            }
            await open(project);
            return;
          }
          if (action === "move") {
            const from = entries.findIndex((e) => e.project.id === data.id),
              to = entries.findIndex((e) => e.project.id === data.before);
            if (from >= 0 && to >= 0 && from !== to) {
              const [e] = entries.splice(from, 1);
              entries.splice(to, 0, e);
              persist();
              publish();
            }
            return;
          }
          if (action === "rename") {
            const e = entries.find((e) => e.project.id === data.id);
            if (e) {
              const owner = e.project.workspaceRoot;
              e.project = library.rename(e.project, data.name);
              e.project.workspaceRoot ||= owner;
              e.service.state.projectInfo.name = e.project.name;
              e.service.publish();
              persist();
              show();
              publish();
            }
            return;
          }
          if (action === "context") {
            const e = entries.find((e) => e.project.id === data.id);
            if (e)
              Menu.buildFromTemplate([
                {
                  label: "Rename…",
                  click: () => {
                    overlay = true;
                    show();
                    win.webContents.send("projects:rename", {
                      id: e.project.id,
                      name: e.project.name,
                    });
                  },
                },
                {
                  label: "Show folder",
                  click: () => shell.openPath(e.project.folder),
                },
                { type: "separator" },
                {
                  label: "Close project",
                  click: () => serialize(() => closeTab(e.project.id)),
                },
              ]).popup({ window: win });
            return;
          }
          throw Error("Unknown project action");
        });
      });
      win.on("resize", layout);
      await win.loadFile(rootFile);
      const index = process.argv.indexOf("--workspace");
      if (workspaces.saved.folder) {
        try {
          workspaces.select(workspaces.saved.folder);
        } catch {
          /* offline workspace remains listed in the folder picker */
        }
      }
      const restoredActive = session.active;
      const restoredWorkspace = workspaces.saved.folder;
      for (const folder of session.folders) {
        try {
          await open(library.open(folder));
        } catch (error) {
          await dialog.showMessageBox(win, {
            type: "warning",
            message: "Could not reopen " + path.basename(folder),
            detail: error.message,
            buttons: ["OK"],
          });
        }
      }
      const restored = entries.find((e) => e.project.folder === restoredActive);
      if (restored) select(restored.project.id);
      else if (restoredActive === null && restoredWorkspace) {
        try {
          workspaces.select(restoredWorkspace);
          active = null;
        } catch {}
      }
      if (index >= 0) {
        try {
          const folder = process.argv[index + 1];
          if (
            require("node:fs").existsSync(path.join(folder, "workspace.yaml"))
          ) {
            workspaces.select(folder);
            active = null;
            persist();
          } else await open(library.open(folder));
        } catch (error) {
          dialog.showErrorBox("Could not open project", error.message);
        }
      }
      show();
      persist();
      publish();
      // Device-owned connection intent survives restarts; projects retain independent sessions.
      timer = setInterval(() => {
        for (const e of all()) {
          const working = status(e) === "working";
          if (
            e.wasWorking &&
            !working &&
            !e.service.state.error &&
            e !== current()
          )
            e.done = true;
          e.wasWorking = working;
          for (const id of e.service.manager.entries.keys())
            if (!enabled.has(id))
              e.service.manager.entries.get(id).connected = false;
          for (const id of enabled) {
            if (e.syncing.has(id) || e.service.state.busy) continue;
            if (e.lastRefresh?.[id] && Date.now() - e.lastRefresh[id] < 10000)
              continue;
            (e.lastRefresh ||= {})[id] = Date.now();
            e.syncing.add(id);
            const task = e.service.manager.clients.has(id)
              ? e.service.manager.refresh(id)
              : e.service.manager.ensure(id);
            task.catch(() => {}).finally(() => e.syncing.delete(id));
          }
          e.service.publish();
        }
        if (settingsOnly && utility)
          utility.view.webContents
            .executeJavaScript(
              `!!document.querySelector('#settings-dialog')?.open`,
            )
            .then((open) => {
              if (!open) {
                settingsOnly = false;
                show();
              }
            })
            .catch(() => {});
        publish();
      }, 2000);
      // Save before closing services; do not erase restored tabs on app quit.
      app.on("before-quit", (event) => {
        if (quitting) return;
        event.preventDefault();
        quitting = true;
        clearInterval(timer);
        persist();
        recorder
          .shutdown()
          .catch(console.error)
          .then(() => Promise.allSettled(all().map((e) => e.service.close())))
          .finally(() => app.exit());
      });
    } catch (error) {
      dialog.showErrorBox(
        "Could not open the app",
        error.stack || error.message,
      );
      app.quit();
    }
  });
  app.on("window-all-closed", () => app.quit());
}
