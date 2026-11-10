import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configureBundledEngine } from "../src/bundled-engine.mjs";
test("installed engine replaces developer SDK/cache paths and fails closed on incomplete or wrong-platform bundles", () => {
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-engine-bundle-"),
  );
  try {
    const env = {
      CHAT_FLUTTER_SDK: "/developer/sdk",
      PUB_CACHE: "/developer/cache",
    };
    assert.deepEqual(configureBundledEngine({ root, data: "/profile", env }), {
      bundled: false,
    });
    fs.mkdirSync(path.join(root, "runtime"));
    const file = path.join(root, "runtime/manifest.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        platform: process.platform,
        arch: process.arch,
        fluvie: "test",
      }),
    );
    assert.throws(
      () => configureBundledEngine({ root, data: "/profile", env }),
      /incomplete/,
    );
    for (const p of [
      "sdk/bin/flutter",
      "sdk/bin/cache/dart-sdk/bin/dart",
      "cache/git/fluvie-test/packages/fluvie_cli/bin/fluvie.dart",
    ]) {
      const f = path.join(root, "runtime", p);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, "fixture");
    }
    assert.equal(
      configureBundledEngine({ root, data: "/profile", env }).bundled,
      true,
    );
    assert.equal(env.CHAT_FLUTTER_SDK, path.join(root, "runtime/sdk"));
    assert.equal(env.PUB_CACHE, path.join(root, "runtime/cache"));
    assert.equal(env.CHAT_WORKER_BASE, "/profile/workers");
    assert.equal(env.CHAT_WORKER_ROOT, undefined); // Per-project worker isolation remains in Playground.
    fs.writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        platform: "unsupported",
        arch: process.arch,
      }),
    );
    assert.throws(
      () => configureBundledEngine({ root, data: "/profile", env }),
      /not compatible/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
