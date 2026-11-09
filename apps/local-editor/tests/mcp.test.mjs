import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
test("stdio MCP exposes the live editor resource with bounded origins and no token in tool text", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "editor-mcp-"));
  const token = "a".repeat(64);
  const http = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        project: { name: "Synthetic MCP test", revision: 9 },
        canUndo: true,
      }),
    );
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${http.address().port}`;
  await mkdir(path.join(root, ".editor"));
  await writeFile(
    path.join(root, ".editor/connection.json"),
    JSON.stringify({ url, token }),
  );
  const client = new Client({ name: "test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("scripts/mcp.mjs"), "--workspace", root],
    stderr: "pipe",
  });
  t.after(async () => {
    await client.close();
    http.closeAllConnections();
    await new Promise((resolve) => http.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  await client.connect(transport);
  const tool = (await client.listTools()).tools.find(
    (t) => t.name === "open_editor",
  );
  assert.equal(
    tool._meta.ui.resourceUri,
    "ui://cmrx-local-editor/workspace.html",
  );
  const result = await client.callTool({ name: "open_editor", arguments: {} });
  assert.equal(result.structuredContent.revision, 9);
  assert.ok(!JSON.stringify(result).includes(token));
  const resource = (
    await client.readResource({ uri: tool._meta.ui.resourceUri })
  ).contents[0];
  assert.equal(resource.mimeType, "text/html;profile=mcp-app");
  assert.match(resource.text, /<iframe/);
  assert.ok(resource.text.includes(url + "/embed#token=" + token));
  assert.deepEqual(resource._meta.ui.csp.frameDomains, [url]);
  assert.equal(
    (await client.callTool({ name: "get_editor_state", arguments: {} }))
      .structuredContent.canUndo,
    true,
  );
  await writeFile(
    path.join(root, ".editor/connection.json"),
    JSON.stringify({ url: "https://untrusted.example", token }),
  );
  assert.equal(
    (await client.callTool({ name: "open_editor", arguments: {} })).isError,
    true,
  );
});
