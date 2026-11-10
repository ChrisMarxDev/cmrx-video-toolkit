import fs from "node:fs";
import path from "node:path";
/** Packaged apps use only their shipped SDK/cache; checkout mode remains unchanged. */
export function configureBundledEngine({ root, data, env = process.env }) {
  const file = path.join(root, "runtime/manifest.json");
  if (!fs.existsSync(file)) return { bundled: false };
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.platform !== process.platform ||
    manifest.arch !== process.arch
  )
    throw Error(
      "This video engine is not compatible with your device. Download the correct app version.",
    );
  for (const relative of [
    "sdk/bin/flutter",
    "sdk/bin/cache/dart-sdk/bin/dart",
    `cache/git/fluvie-${manifest.fluvie}/packages/fluvie_cli/bin/fluvie.dart`,
  ]) {
    if (!fs.existsSync(path.join(root, "runtime", relative)))
      throw Error(
        "The installed video engine is incomplete. Reinstall the app.",
      );
  }
  env.CHAT_FLUTTER_SDK = path.join(root, "runtime/sdk");
  env.PUB_CACHE = path.join(root, "runtime/cache");
  env.CHAT_WORKER_BASE = path.join(data, "workers");
  return { bundled: true, ...manifest };
}
