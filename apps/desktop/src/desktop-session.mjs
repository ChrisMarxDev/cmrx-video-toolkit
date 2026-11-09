import fs from "node:fs";
import path from "node:path";
export class DesktopSession {
  constructor(root) {
    this.file = path.join(root, "open-projects.json");
    try {
      const saved = JSON.parse(fs.readFileSync(this.file));
      this.folders = Array.isArray(saved.folders)
        ? saved.folders.filter((f) => typeof f === "string")
        : [];
      this.active = saved.active;
    } catch {
      this.folders = [];
      this.active = null;
    }
  }
  save(projects, active) {
    this.folders = projects.map((p) => p.folder);
    this.active = active;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(
      this.file + ".tmp",
      JSON.stringify({ folders: this.folders, active }),
      { mode: 0o600 },
    );
    fs.renameSync(this.file + ".tmp", this.file);
  }
}
// A single render slot across project services. Canceling a waiting project must
// remove its ticket rather than starting its renderer after the project closes.
export class RenderQueue {
  constructor() {
    this.tail = Promise.resolve();
  }
  async acquire(signal) {
    const before = this.tail;
    let unlock;
    const own = new Promise((r) => (unlock = r));
    this.tail = before.then(() => own);
    let abort;
    const canceled = new Promise((_, reject) => {
      abort = () => reject(Error("Render canceled"));
      signal?.addEventListener("abort", abort, { once: true });
    });
    try {
      if (signal?.aborted) throw Error("Render canceled");
      await Promise.race([before, canceled]);
    } catch (e) {
      before.then(unlock);
      throw e;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
    return unlock;
  }
}
