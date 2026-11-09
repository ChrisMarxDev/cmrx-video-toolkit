import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
const script = fileURLToPath(new URL("preflight.mjs", import.meta.url));
const run = (args) =>
  spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

test("missing checkout and invalid arguments fail without creating release files", () => {
  const task = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-deploy-preflight-"),
  );
  try {
    const missing = run(["--repo", task]);
    assert.equal(missing.status, 2);
    assert.equal(JSON.parse(missing.stdout).status, "blocked");
    assert.deepEqual(fs.readdirSync(task), []);
    assert.equal(run(["--publish"]).status, 2);
  } finally {
    fs.rmSync(task, { recursive: true, force: true });
  }
});

test("preflight diagnoses runtime metadata, dirty source, lock drift and preserves the checkout", () => {
  const task = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-deploy-preflight-"),
  );
  const root = path.join(task, "toolkit"),
    app = path.join(root, "apps/desktop");
  try {
    fs.mkdirSync(path.join(app, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(app, "package.json"),
      JSON.stringify({ name: "cmrx-desktop", version: "1.2.3" }),
    );
    const lock = path.join(app, "package-lock.json");
    fs.writeFileSync(
      lock,
      JSON.stringify({
        version: "1.2.3",
        packages: { "": { version: "1.2.3" } },
      }),
    );
    fs.writeFileSync(
      path.join(app, "src/playground.mjs"),
      "// macOS worker adapter fixture, not actual acceptance\n",
    );
    fs.writeFileSync(
      path.join(app, "forge.config.cjs"),
      "module.exports = {};\n",
    );
    const runtime = path.join(app, "src/runtime-manager.mjs");
    fs.writeFileSync(
      runtime,
      `export function releaseFor(id){return {version:'1',url:'https://example.test/engine',checksum:'${"a".repeat(64)}',companions:[{name:'codex-code-mode-host',url:'https://example.test/host',checksum:'${"b".repeat(64)}'}]};}`,
    );
    const git = (...args) =>
      execFileSync("git", args, { cwd: root, stdio: "pipe" }).toString();
    git("init", "--initial-branch=main");
    git("config", "user.name", "Deployment fixture");
    git("config", "user.email", "fixture@example.test");
    git("config", "commit.gpgsign", "false");
    fs.mkdirSync(path.join(task, "empty-hooks"));
    git("config", "core.hooksPath", path.join(task, "empty-hooks"));
    git(
      "remote",
      "add",
      "origin",
      "https://github.com/ChrisMarxDev/cmrx-video-toolkit.git",
    );
    git("add", ".");
    git("commit", "-m", "Fixture");
    const result = JSON.parse(run(["--repo", root]).stdout);
    assert.equal(result.checks.chatgptDarwinMetadata, true);
    assert.equal(result.checks.claudeDarwinMetadata, true);
    assert.equal(result.checks.canonicalOrigin, true);
    assert.equal(result.checks.cleanSource, true);
    assert.notEqual(result.status, "ready");
    assert.equal(git("status", "--porcelain"), "");
    fs.writeFileSync(
      runtime,
      "export function releaseFor(){throw Error('Linux only');}",
    );
    fs.writeFileSync(
      lock,
      JSON.stringify({
        version: "9.0.0",
        packages: { "": { version: "9.0.0" } },
      }),
    );
    const before = git("status", "--porcelain");
    const blocked = run(["--repo", root]);
    assert.equal(blocked.status, 2);
    const report = JSON.parse(blocked.stdout);
    assert(report.blockers.some((x) => x.includes("versions differ")));
    assert.equal(report.checks.chatgptDarwinMetadata, false);
    assert.equal(report.checks.cleanSource, false);
    assert.equal(git("status", "--porcelain"), before);
  } finally {
    fs.rmSync(task, { recursive: true, force: true });
  }
});

test(
  "signature helper refuses Linux rather than pretending to verify a Mac artifact",
  { skip: process.platform === "darwin" },
  () => {
    const verify = fileURLToPath(new URL("verify-macos.sh", import.meta.url));
    const help = spawnSync("bash", [verify, "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0);
    const result = spawnSync(
      "bash",
      [verify, "/nonexistent/App.app", "test.fixture", "TEAMFIXTURE"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /requires macOS/);
  },
);
