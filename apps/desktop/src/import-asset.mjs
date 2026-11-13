import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { importVideo } from "./import-video.mjs";

export async function importAsset({
  stream,
  name,
  workspace,
  playground,
  editor,
  signal,
  onProgress = () => {},
  limit = 2 * 1024 ** 3,
}) {
  if (typeof name !== "string" || !name.trim())
    throw Error("Choose a named file");
  const safeName = path
    .basename(name.replaceAll("\\", "/"))
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .slice(-160);
  if (!safeName || /^\.+$/.test(safeName)) throw Error("Invalid filename");
  const relative = `assets/imports/${randomUUID()}-${safeName}`;
  const file = playground.file(relative, true);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  playground.file(relative, true);
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    await pipeline(
      stream,
      new Transform({
        transform(chunk, _, next) {
          bytes += chunk.length;
          if (bytes > limit)
            return next(Error("Files must be smaller than 2 GB"));
          hash.update(chunk);
          next(null, chunk);
        },
      }),
      fs.createWriteStream(file, { flags: "wx", mode: 0o600 }),
      { signal },
    );
    if (!bytes) throw Error("Empty files cannot be imported");
  } catch (error) {
    fs.rmSync(file, { force: true });
    throw error;
  }
  const video = /\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(safeName);
  const asset = {
    name: safeName,
    path: relative,
    bytes,
    sha256: hash.digest("hex"),
    kind: video ? "video" : "asset",
    addedAt: new Date().toISOString(),
  };
  if (video) {
    try {
      asset.timeline = await importVideo({
        workspace,
        source: file,
        displayName: safeName,
        editor,
        signal,
        onProgress,
      });
    } catch (error) {
      asset.warning = `Saved as an asset; could not add to the timeline: ${error.message}`;
    }
  }
  const receipts = path.join(workspace, ".editor/imported-assets.json");
  let previous = [];
  try {
    previous = JSON.parse(fs.readFileSync(receipts));
  } catch {}
  const tmp = receipts + "." + randomUUID() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify([...previous, asset].slice(-100)), {
    mode: 0o600,
  });
  fs.renameSync(tmp, receipts);
  return asset;
}
