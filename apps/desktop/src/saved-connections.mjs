import fs from "node:fs";
import path from "node:path";
const providers = new Set(["chatgpt", "claude"]);
// Stores connection intent only. Credentials stay in the providers' managed homes.
export class SavedConnections extends Set {
  constructor(root) {
    super();
    this.file = path.join(root, "saved-connections.json");
    let saved = [];
    if (fs.existsSync(this.file)) {
      try {
        saved = JSON.parse(fs.readFileSync(this.file));
      } catch {}
    } else {
      // Upgrade the former launch-only gate using app-owned credentials only.
      if (fs.existsSync(path.join(root, "accounts/codex/auth.json")))
        saved.push("chatgpt");
      if (fs.existsSync(path.join(root, "accounts/claude/.credentials.json")))
        saved.push("claude");
    }
    if (Array.isArray(saved))
      for (const id of saved) if (providers.has(id)) super.add(id);
    this.save();
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + ".tmp", JSON.stringify([...this]), {
      mode: 0o600,
    });
    fs.renameSync(this.file + ".tmp", this.file);
  }
  add(id) {
    if (!providers.has(id)) throw Error("Unknown provider");
    super.add(id);
    this.save();
    return this;
  }
  delete(id) {
    const result = super.delete(id);
    this.save();
    return result;
  }
}
