import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const { softwarePreviewEnabled } = createRequire(import.meta.url)(
  "../src/software-preview.cjs",
);
test("software preview persists across relaunch without changing other profile settings", () => {
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-software-preview-"),
  );
  try {
    assert.equal(softwarePreviewEnabled(root), false);
    fs.writeFileSync(path.join(root, "performance.json"), "null");
    assert.equal(softwarePreviewEnabled(root), false);
    fs.writeFileSync(
      path.join(root, "performance.json"),
      JSON.stringify({ other: "keep" }),
    );
    assert.equal(softwarePreviewEnabled(root, "1"), true);
    assert.equal(softwarePreviewEnabled(root), true);
    assert.equal(softwarePreviewEnabled(root, "0"), false);
    assert.equal(softwarePreviewEnabled(root), false);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, "performance.json"))).other,
      "keep",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
