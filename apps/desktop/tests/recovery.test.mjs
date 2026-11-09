import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

test("the editor service releases its workspace if its desktop owner dies", async () => {
  const root = fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "cmrx-desktop-recovery-",
    ),
  );
  const server = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
  const code = `import {startApp} from ${JSON.stringify(server)};const app=await startApp({workspace:${JSON.stringify(root)},providerFactory:()=>({async start(){},close(){}})});console.log('READY');`;
  const owner = spawn(process.execPath, ["--input-type=module", "-e", code], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  owner.stdout.on("data", (d) => (output += d));
  owner.stderr.resume();
  try {
    for (let i = 0; i < 100 && !output.includes("READY"); i++)
      await new Promise((r) => setTimeout(r, 50));
    assert(output.includes("READY"), "Desktop owner must start");
    const lock = path.join(root, ".editor/server.lock");
    assert(fs.existsSync(lock));
    const exited = new Promise((r) => owner.once("exit", r));
    owner.kill("SIGKILL");
    await exited;
    for (let i = 0; i < 100 && fs.existsSync(lock); i++)
      await new Promise((r) => setTimeout(r, 50));
    assert.equal(fs.existsSync(lock), false);
    assert(fs.existsSync(path.join(root, "project.json")));
  } finally {
    owner.kill("SIGKILL");
    fs.rmSync(root, { recursive: true, force: true });
  }
});
