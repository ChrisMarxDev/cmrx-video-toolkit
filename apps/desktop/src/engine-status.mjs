import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
export function engineStatus() {
  const missing = [];
  for (const name of [
    "ffmpeg",
    "ffprobe",
    ...(process.platform === "darwin" ? [] : ["bwrap"]),
  ])
    try {
      execFileSync(name, ["-version"], { stdio: "ignore", timeout: 5000 });
    } catch {
      try {
        execFileSync(name, ["--version"], { stdio: "ignore", timeout: 5000 });
      } catch {
        missing.push(name);
      }
    }
  if (process.platform === "darwin") {
    try {
      execFileSync(
        "/usr/bin/sandbox-exec",
        [
          "-p",
          "(version 1)(deny default)(allow process-exec)(allow file-read*)(allow sysctl-read)",
          "/usr/bin/true",
        ],
        { stdio: "ignore", timeout: 5000 },
      );
    } catch {
      missing.push("sandbox access");
    }
  }
  if (process.platform !== "darwin" && !missing.includes("bwrap"))
    try {
      execFileSync(
        "bwrap",
        [
          "--unshare-all",
          "--ro-bind",
          "/usr",
          "/usr",
          "--symlink",
          "usr/bin",
          "/bin",
          "--symlink",
          "usr/lib",
          "/lib",
          "--symlink",
          fs.existsSync("/usr/lib64") ? "usr/lib64" : "usr/lib",
          "/lib64",
          "--",
          "/usr/bin/true",
        ],
        { stdio: "ignore", timeout: 5000 },
      );
    } catch {
      missing.push("sandbox access");
    }
  let sdk = process.env.CHAT_FLUTTER_SDK;
  if (!sdk)
    try {
      sdk = path.dirname(
        path.dirname(
          execFileSync("which", ["flutter"], {
            encoding: "utf8",
            timeout: 5000,
          }).trim(),
        ),
      );
    } catch {}
  if (!sdk || !fs.existsSync(path.join(sdk, "bin/flutter")))
    missing.push("Flutter");
  const cache = process.env.PUB_CACHE || path.join(os.homedir(), ".pub-cache");
  if (
    !fs.existsSync(
      path.join(
        cache,
        "git/fluvie-10e442c1bb469118516df3335547f85ec92155e6/packages/fluvie_cli/bin/fluvie.dart",
      ),
    )
  )
    missing.push("video runtime");
  return { available: missing.length === 0, missing };
}
