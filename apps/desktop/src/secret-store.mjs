import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
export class SecretStore {
  constructor(root, codec) {
    this.file = path.join(root, "secrets.json");
    this.codec = codec;
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    try {
      this.entries = JSON.parse(fs.readFileSync(this.file));
    } catch {
      this.entries = [];
    }
  }
  list() {
    this.reload();
    return this.entries.map(({ id, name, updatedAt }) => ({
      id,
      name,
      updatedAt,
    }));
  }
  put({ id, name, value }) {
    this.reload();
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 100 ||
      typeof value !== "string" ||
      !value ||
      value.length > 16000
    )
      throw Error("Enter a name and key.");
    if (id && !this.entries.some((s) => s.id === id))
      throw Error("Key not found");
    const entry = {
      id: id || randomUUID(),
      name: name.trim(),
      updatedAt: new Date().toISOString(),
      encrypted: !!this.codec,
      value: this.codec ? this.codec.encrypt(value) : value,
    };
    this.entries = [...this.entries.filter((s) => s.id !== entry.id), entry];
    this.save();
    return entry.id;
  }
  get(id) {
    this.reload();
    const e = this.entries.find((e) => e.id === id);
    if (!e) throw Error("Key not found");
    if (e.encrypted && !this.codec)
      throw Error("Device key storage is unavailable");
    return e.encrypted ? this.codec.decrypt(e.value) : e.value;
  }
  remove(id) {
    this.reload();
    this.entries = this.entries.filter((e) => e.id !== id);
    this.save();
  }
  save() {
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.entries), {
      mode: 0o600,
    });
    fs.renameSync(this.file + ".tmp", this.file);
  }
  reload() {
    try {
      this.entries = JSON.parse(fs.readFileSync(this.file));
    } catch {}
  }
  redact(value) {
    this.reload();
    const keys = this.entries.flatMap((e) => {
      try {
        return [this.get(e.id)];
      } catch {
        return [];
      }
    });
    const scrub = (x) =>
      typeof x === "string"
        ? keys.reduce((s, k) => s.split(k).join("[secret]"), x)
        : Array.isArray(x)
          ? x.map(scrub)
          : x && typeof x === "object"
            ? Object.fromEntries(
                Object.entries(x).map(([k, v]) => [scrub(k), scrub(v)]),
              )
            : x;
    return typeof value === "string"
      ? scrub(value)
      : JSON.stringify(scrub(value));
  }
}
