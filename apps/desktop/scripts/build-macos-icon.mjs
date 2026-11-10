#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const resources = fileURLToPath(new URL("../resources/", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : path.resolve(process.argv[index + 1]);
};
if (process.platform !== "darwin") throw Error("Build ICNS assets on macOS.");
const source = option(
  "--source",
  path.join(resources, "macos-placeholder.png"),
);
const output = option(
  "--output",
  path.join(resources, "macos-placeholder.icns"),
);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cmrx-icon-"));
const iconset = path.join(temporary, "AppIcon.iconset");
fs.mkdirSync(iconset);
try {
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = String(size * scale);
      const name = `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`;
      execFileSync(
        "/usr/bin/sips",
        ["-z", pixels, pixels, source, "--out", path.join(iconset, name)],
        { stdio: "ignore" },
      );
    }
  }
  execFileSync(
    "/usr/bin/iconutil",
    ["--convert", "icns", "--output", output, iconset],
    { stdio: "inherit" },
  );
  console.log(output);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
