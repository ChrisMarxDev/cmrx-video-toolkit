#!/usr/bin/env node
// Read-only release diagnostics. No install, download, Keychain changes or release mutation.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log("Usage: node preflight.mjs [--repo <toolkit-or-studio>]");
  process.exit(0);
}
if (argv.length && (argv.length !== 2 || argv[0] !== "--repo")) {
  console.error("Expected --repo <path>");
  process.exit(2);
}
const supplied = path.resolve(argv[1] || process.cwd());
const repo = [supplied, path.join(supplied, "cmrx-video-toolkit")].find((p) =>
  fs.existsSync(path.join(p, "apps/desktop/package.json")),
);
if (!repo) {
  console.log(
    JSON.stringify(
      {
        status: "blocked",
        blockers: ["Cannot locate apps/desktop/package.json; pass --repo."],
      },
      null,
      2,
    ),
  );
  process.exit(2);
}
const app = path.join(repo, "apps/desktop");
const blockers = [],
  warnings = [];
const run = (command, args = []) => {
  const r = spawnSync(command, args, {
    cwd: repo,
    encoding: "utf8",
    timeout: 10000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { ok: !r.error && r.status === 0, text: (r.stdout || "").trim() };
};
const report = {
  status: "blocked",
  platform: process.platform,
  arch: process.arch,
  version: null,
  source: null,
  checks: {},
  blockers,
  warnings,
};
try {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(app, "package.json"), "utf8"),
  );
  const lock = JSON.parse(
    fs.readFileSync(path.join(app, "package-lock.json"), "utf8"),
  );
  report.version = pkg.version;
  if (
    pkg.version !== lock.version ||
    pkg.version !== lock.packages?.[""]?.version
  )
    blockers.push("Desktop package and lock versions differ.");
  if (
    Number(process.versions.node.split(".")[0]) < 22 ||
    (Number(process.versions.node.split(".")[0]) === 22 &&
      Number(process.versions.node.split(".")[1]) < 12)
  )
    blockers.push("Node 22.12+ is required.");
  const head = run("git", ["rev-parse", "HEAD"]);
  report.source = head.ok ? head.text : null;
  if (!head.ok) blockers.push("Toolkit is not a Git checkout.");
  const dirty = run("git", ["status", "--porcelain"]);
  report.checks.cleanSource = dirty.ok && !dirty.text;
  if (!report.checks.cleanSource)
    blockers.push(
      "Source checkout is dirty or Git status failed; never tag this state.",
    );
  const origin = run("git", ["remote", "get-url", "origin"]);
  report.checks.canonicalOrigin =
    origin.ok &&
    /[:/]ChrisMarxDev\/cmrx-video-toolkit(?:\.git)?$/i.test(origin.text);
  if (!report.checks.canonicalOrigin)
    warnings.push(
      "Verify intended repository before any tag/upload; canonical origin not detected.",
    );
  try {
    const runtime = await import(
      pathToFileURL(path.join(app, "src/runtime-manager.mjs")).href
    );
    for (const id of ["chatgpt", "claude"]) {
      try {
        const r = runtime.releaseFor(id, process.arch, "darwin");
        const valid =
          typeof r.url === "string" &&
          r.url.startsWith("https://") &&
          /^[a-f0-9]{64}$/i.test(r.checksum || "") &&
          !!r.version &&
          (id !== "chatgpt" ||
            r.companions?.some(
              (c) =>
                c.name === "codex-code-mode-host" &&
                typeof c.url === "string" &&
                c.url.startsWith("https://") &&
                /^[a-f0-9]{64}$/i.test(c.checksum || ""),
            ));
        report.checks[id + "DarwinMetadata"] = valid;
        if (!valid)
          blockers.push(
            `${id}: Darwin release metadata/checksums or companion are incomplete.`,
          );
      } catch {
        report.checks[id + "DarwinMetadata"] = false;
        blockers.push(
          `${id}: Darwin runtime release is not supported by the current installer.`,
        );
      }
    }
  } catch {
    blockers.push(
      "Provider releaseFor diagnostics unavailable; inspect runtime-manager and update this probe.",
    );
  }
  const worker = fs.readFileSync(path.join(app, "src/playground.mjs"), "utf8");
  report.checks.macosWorkerBranch = /darwin|macos/i.test(worker);
  if (!report.checks.macosWorkerBranch)
    blockers.push(
      "No macOS worker branch detected; inspect renderer/isolation before claiming Mac support.",
    );
  else
    warnings.push(
      "Mac worker source marker is not behavioral or containment proof; run native acceptance.",
    );
  report.checks.packager = !!(
    pkg.config?.forge ||
    pkg.build?.mac ||
    fs.existsSync(path.join(app, "scripts/package-macos.mjs")) ||
    [
      "forge.config.js",
      "forge.config.cjs",
      "forge.config.mjs",
      "forge.config.ts",
      "electron-builder.yml",
      "electron-builder.yaml",
    ].some((n) => fs.existsSync(path.join(app, n)))
  );
  if (!report.checks.packager)
    blockers.push(
      "No recognized Mac packaging configuration; current app is source-only.",
    );
} catch (error) {
  blockers.push("Source inspection failed: " + error.message);
}
if (process.platform !== "darwin")
  blockers.push(
    "Run native build/sign/notarize and acceptance on macOS; this host cannot certify a Mac release.",
  );
else {
  for (const tool of [
    "npm",
    "gh",
    "codesign",
    "security",
    "xcrun",
    "ditto",
    "hdiutil",
    "spctl",
    "xcode-select",
  ]) {
    report.checks[tool] = run("which", [tool]).ok;
    if (!report.checks[tool]) blockers.push("Missing tool: " + tool);
  }
  report.checks.xcode = run("xcode-select", ["-p"]).ok;
  report.checks.notarytool = run("xcrun", ["--find", "notarytool"]).ok;
  if (!report.checks.xcode || !report.checks.notarytool)
    blockers.push(
      "Xcode/notarytool is not ready. Code preparation may continue independently.",
    );
  const identities = run("security", [
    "find-identity",
    "-v",
    "-p",
    "codesigning",
  ]);
  report.checks.developerIdIdentity =
    identities.ok && identities.text.includes("Developer ID Application:");
  if (!report.checks.developerIdIdentity)
    blockers.push(
      "No Developer ID Application signing identity found; build/test can proceed unsigned locally.",
    );
}
report.status = blockers.length ? "blocked" : "requires_native_acceptance";
console.log(JSON.stringify(report, null, 2));
process.exitCode = blockers.length ? 2 : 0;
