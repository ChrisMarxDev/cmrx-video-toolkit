import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { transform } from "esbuild";
test("thumbnail requests leave connections free, share work and cancel invisible queued work", async () => {
  const { code } = await transform(
    fs.readFileSync(
      new URL("../src/preview-requests.ts", import.meta.url),
      "utf8",
    ),
    { loader: "ts", format: "esm" },
  );
  const { acquirePreview } = await import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64")
  );
  const savedFetch = globalThis.fetch,
    started = [],
    controls = new Map(),
    tickets = [];
  globalThis.fetch = (url, { signal }) =>
    new Promise((resolve, reject) => {
      started.push(url);
      controls.set(url, { resolve, signal });
      signal.addEventListener("abort", () =>
        reject(new DOMException("Cancelled", "AbortError")),
      );
    });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  try {
    for (let i = 0; i < 5; i++) {
      const t = acquirePreview(String(i), String(i));
      t.promise.catch(() => {});
      tickets.push(t);
    }
    assert.deepEqual(started, ["0", "1"]);
    tickets[4].release();
    await assert.rejects(tickets[4].promise, { name: "AbortError" });
    controls.get("0").resolve({ ok: true, json: async () => ({ value: 0 }) });
    assert.deepEqual(await tickets[0].promise, { value: 0 });
    await tick();
    assert.deepEqual(started, ["0", "1", "2"]);
    const shared = acquirePreview("2", "2");
    tickets.push(shared);
    assert.equal(shared.promise, tickets[2].promise);
    tickets[2].release();
    assert.equal(controls.get("2").signal.aborted, false);
    shared.release();
    await tick();
    assert.equal(controls.get("2").signal.aborted, true);
    assert.equal(started.includes("4"), false);
    const cached = acquirePreview("0", "0");
    tickets.push(cached);
    assert.deepEqual(await cached.promise, { value: 0 });
    assert.equal(started.filter((url) => url === "0").length, 1);
  } finally {
    for (const t of tickets) t.release();
    await tick();
    globalThis.fetch = savedFetch;
  }
});
