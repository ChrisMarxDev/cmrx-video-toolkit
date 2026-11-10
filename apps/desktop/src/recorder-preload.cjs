const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("recording", {
  command: (action, data) =>
    ipcRenderer.invoke("recording:command", action, data),
  onSources: (callback) =>
    ipcRenderer.on("recording:sources", (_event, sources) => callback(sources)),
  onStop: (callback) => ipcRenderer.on("recording:stop", () => callback()),
});
