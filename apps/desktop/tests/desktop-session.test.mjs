import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DesktopSession, RenderQueue } from "../src/desktop-session.mjs";
import { ProjectLibrary } from "../src/project-library.mjs";
import { SecretStore } from "../src/secret-store.mjs";
import { Connections } from "../src/connections.mjs";
test("creation, canonical reopening, display names and tab order survive restart", () => {
  const root = fs.mkdtempSync(path.join(os.homedir(), ".cache/cmrx-tabs-"));
  try {
    const library = new ProjectLibrary(root);
    const a = library.create(path.join(root, "projects"), "Film");
    fs.writeFileSync(path.join(a.workspace, "project.json"), "{}");
    const b = library.create(path.join(root, "projects"), "Film");
    assert.notEqual(a.folder, b.folder);
    fs.writeFileSync(path.join(b.workspace, "project.json"), "{}");
    assert.equal(library.open(a.workspace).workspace, a.workspace);
    const renamed = library.rename(a, "New name");
    assert.equal(new ProjectLibrary(root).open(a.folder).name, "New name");
    assert(fs.existsSync(a.folder));
    assert.throws(() => library.create(root, "../escape"));
    const tabs = new DesktopSession(root);
    tabs.save([b, renamed], a.folder);
    const loaded = new DesktopSession(root);
    assert.deepEqual(loaded.folders, [b.folder, a.folder]);
    assert.equal(loaded.active, a.folder);
    loaded.save([], null);
    assert.deepEqual(new DesktopSession(root).folders, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("render slots serialize projects and cancel waiting work without deadlock", async () => {
  const q = new RenderQueue(),
    controller = new AbortController();
  const release = await q.acquire();
  let started = false;
  const second = q.acquire(controller.signal);
  const rejected = assert.rejects(second, /canceled/);
  controller.abort();
  await rejected;
  const third = q.acquire().then((r) => {
    started = true;
    return r;
  });
  await new Promise((r) => setTimeout(r, 10));
  assert(!started);
  release();
  const done = await third;
  assert(started);
  done();
  const again = await q.acquire();
  again();
});
test("shared keys and connection settings remain visible across project instances", async () => {
  const root = fs.mkdtempSync(
    path.join(os.homedir(), ".cache/cmrx-shared-tabs-"),
  );
  let ca, cb;
  try {
    const a = new SecretStore(root),
      b = new SecretStore(root);
    a.put({ name: "one", value: "alpha" });
    const id = b.put({ name: "two", value: "bravo" });
    assert.equal(a.list().length, 2);
    assert.equal(a.get(id), "bravo");
    ca = new Connections({ root, secrets: a });
    cb = new Connections({ root, secrets: b });
    const one = await ca.put({
      name: "A",
      type: "http",
      url: "https://example.com",
    });
    await cb.put({ name: "B", type: "http", url: "https://example.org" });
    assert.equal(ca.list().length, 2);
    await cb.remove(one);
    assert.equal(ca.list().length, 1);
  } finally {
    await ca?.close();
    await cb?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
