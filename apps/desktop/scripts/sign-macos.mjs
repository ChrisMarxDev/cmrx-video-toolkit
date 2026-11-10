#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { sign } from "@electron/osx-sign";
const app = process.argv[2],
  identity = process.env.CMRX_SIGN_IDENTITY;
if (process.platform !== "darwin" || !app?.endsWith(".app") || !identity)
  throw Error(
    'Usage: CMRX_SIGN_IDENTITY="Developer ID Application: …" node sign-macos.mjs /path/to/App.app',
  );
const native = new Set();
function scan(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) scan(file);
    else if (item.isFile()) {
      const fd = fs.openSync(file, "r"),
        magic = Buffer.alloc(4);
      try {
        fs.readSync(fd, magic, 0, 4, 0);
      } finally {
        fs.closeSync(fd);
      }
      if (
        [
          "cffaedfe",
          "cefaedfe",
          "feedfacf",
          "feedface",
          "cafebabe",
          "bebafeca",
          "cafebabf",
          "bfbafeca",
        ].includes(magic.toString("hex"))
      )
        native.add(file);
    }
  }
}
scan(path.resolve(app));
// All bundled code is signed inside-out by osx-sign, including SDK executables.
// No camera, microphone, network-server, app-sandbox or debug entitlements.
await sign({
  app: path.resolve(app),
  identity,
  binaries: [...native],
  ignore: (file) =>
    !(
      native.has(file) ||
      file === path.resolve(app) ||
      file.endsWith(".app") ||
      file.endsWith(".framework")
    ),
  platform: "darwin",
  type: "distribution",
  version: "43.0.0",
  preAutoEntitlements: false,
  preEmbedProvisioningProfile: false,
  optionsForFile: (file) => ({
    hardenedRuntime: true,
    entitlements: /\.app$|\/MacOS\/|\/dart(?:vm)?$|\/flutter_tester$/.test(file)
      ? ["com.apple.security.cs.allow-jit"]
      : [],
  }),
});
execFileSync(
  "/usr/bin/codesign",
  ["--verify", "--deep", "--strict", "--verbose=2", app],
  { stdio: "inherit" },
);
console.log("Signed and verified " + app);
