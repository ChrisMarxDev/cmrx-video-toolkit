const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("projects", {
  command: (action, data) =>
    ipcRenderer.invoke("projects:command", action, data),
  subscribe: (callback) => {
    ipcRenderer.on("projects:state", (_event, state) => callback(state));
  },
  onRename: (callback) =>
    ipcRenderer.on("projects:rename", (_event, data) => callback(data)),
  onShortcut: (callback) =>
    ipcRenderer.on("projects:shortcut", (_event, key) => callback(key)),
});
