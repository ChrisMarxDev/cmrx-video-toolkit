import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { ProjectAgent } from "../src/project-agent.mjs";
import { SecretStore } from "../src/secret-store.mjs";
import { ProjectSkills } from "../src/project-skills.mjs";
import { codexContent } from "../src/tool-content.mjs";
import { inspectFrame } from "../src/visual-inspection.mjs";
import { readWeb } from "../src/web-access.mjs";
const folder = () =>
  fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "cmrx-project-agent-test-",
    ),
  );
const until = async (f) => {
  for (let i = 0; i < 100; i++) {
    const v = f();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("Expected action did not appear");
};
function setup(root) {
  const workspace = path.join(root, "project");
  fs.mkdirSync(path.join(workspace, ".editor"), { recursive: true });
  return new ProjectAgent({ root: path.join(root, "profile"), workspace });
}
test("named secrets never return their values, persist with codec/private permissions, and redact JSON safely", () => {
  const root = folder();
  try {
    const codec = {
      encrypt: (v) => Buffer.from(v).toString("base64"),
      decrypt: (v) => Buffer.from(v, "base64").toString(),
    };
    const vault = new SecretStore(root, codec);
    const token = 'secret-"with-quote"-12345';
    const id = vault.put({ name: "Publishing key", value: token });
    assert(!JSON.stringify(vault.list()).includes(token));
    assert(!fs.readFileSync(vault.file, "utf8").includes(token));
    assert.equal(fs.statSync(vault.file).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(vault.redact({ echo: token })), {
      echo: "[secret]",
    });
    assert.equal(new SecretStore(root, codec).get(id), token);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("skills include app/toolkit/project instructions and support files, reject traversal and keep notes durable", () => {
  const root = folder();
  try {
    const workspace = path.join(root, "work");
    fs.mkdirSync(workspace);
    const skills = new ProjectSkills({ workspace, root });
    const catalog = skills.catalog();
    assert(catalog.some((s) => s.id === "app/video-project"));
    assert(catalog.some((s) => s.id === "toolkit/component-shaders"));
    assert.match(skills.read("app/video-project").text, /publishing/i);
    const input = path.join(root, "new-skill");
    fs.mkdirSync(path.join(input, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(input, "SKILL.md"),
      "---\nname: fixture-skill\ndescription: >\n  A multiline skill.\n---\nInstructions",
    );
    fs.writeFileSync(path.join(input, "scripts/check.py"), "print(42)");
    skills.install(input);
    assert.equal(
      skills.read("installed/fixture-skill", "scripts/check.py").text,
      "print(42)",
    );
    assert.throws(
      () => skills.read("installed/fixture-skill", "../../secrets.json"),
      /outside/,
    );
    skills.write("AGENTS.md", "Use German");
    skills.write("memory.md", "Keep the original audio");
    assert.equal(skills.settings().memory, "Keep the original audio");
    assert.throws(() => skills.text("../secrets.json"), /Invalid/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("real stdio MCP supports discovery/resources/prompts, injects keys privately and confirms side effects", async () => {
  const root = folder();
  const agent = setup(root);
  try {
    const key = agent.secrets.put({
      name: "Fixture key",
      value: "test-private-token-987654",
    });
    const id = await agent.connections.put({
      name: "Fixture",
      type: "stdio",
      command: process.execPath,
      args: [
        fileURLToPath(new URL("./fixtures/project-mcp.mjs", import.meta.url)),
      ],
      secretId: key,
    });
    const tools = await agent.tool("mcp_tools", { connection: id }, {});
    assert.equal(tools.length, 2);
    assert(
      !JSON.stringify(agent.snapshot()).includes("test-private-token-987654"),
    );
    const read = await agent.tool(
      "mcp_call",
      { connection: id, tool: "read_info" },
      {},
    );
    assert.match(read.content[0].text, /\[secret\]/);
    assert(!read.content[0].text.includes("test-private"));
    assert.equal(
      (await agent.tool("mcp_resources", { connection: id }, {})).resources
        .length,
      1,
    );
    assert.match(
      (
        await agent.tool(
          "mcp_resource_read",
          { connection: id, uri: "fixture://brief" },
          {},
        )
      ).contents[0].text,
      /Project brief/,
    );
    assert.equal(
      (await agent.tool("mcp_prompts", { connection: id }, {})).prompts.length,
      1,
    );
    assert.match(
      (
        await agent.tool(
          "mcp_prompt",
          { connection: id, name: "brief", arguments: { theme: "video" } },
          {},
        )
      ).messages[0].content.text,
      /video/,
    );
    const action = agent.tool(
      "mcp_call",
      { connection: id, tool: "publish_item", arguments: { title: "Preview" } },
      {},
    );
    const approval = await until(() => agent.snapshot().approvals[0]);
    assert.equal(
      fs.existsSync(path.join(agent.root, "fixture-actions.jsonl")),
      false,
    );
    agent.decide(approval.id, true);
    await action;
    assert.match(
      fs.readFileSync(path.join(agent.root, "fixture-actions.jsonl"), "utf8"),
      /Preview/,
    );
    const declined = agent.tool(
      "mcp_call",
      {
        connection: id,
        tool: "publish_item",
        arguments: { title: "Declined" },
      },
      {},
    );
    const next = await until(() => agent.snapshot().approvals[0]);
    agent.decide(next.id, false);
    await assert.rejects(declined, /declined/);
    assert(
      !fs
        .readFileSync(path.join(agent.root, "fixture-actions.jsonl"), "utf8")
        .includes("Declined"),
    );
  } finally {
    await agent.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("generic HTTP connections inject key headers, constrain destinations, and upload only completed artifacts", async () => {
  const root = folder();
  const agent = setup(root);
  let observed;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    observed = {
      auth: req.headers["x-key"],
      type: req.headers["content-type"],
      body: Buffer.concat(chunks),
    };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ echo: req.headers["x-key"], ok: true }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const key = agent.secrets.put({
      name: "HTTP key",
      value: "http-token-987654",
    });
    const id = await agent.connections.put({
      name: "Generic API",
      type: "http",
      url: `http://127.0.0.1:${server.address().port}/api`,
      secretId: key,
      header: "X-Key",
    });
    const read = await agent.tool(
      "connection_request",
      { connection: id, route: "info" },
      {},
    );
    assert.equal(observed.auth, "http-token-987654");
    assert(!read.body.includes("http-token"));
    await assert.rejects(
      agent.connections.request(id, { route: "http://example.com/api" }),
      /within/,
    );
    const jobs = path.join(agent.workspace, ".editor/playground");
    fs.mkdirSync(jobs, { recursive: true });
    const file = path.join(jobs, "preview.mp4");
    fs.writeFileSync(file, "fixture-video-bytes");
    const playground = {
      jobsDir: jobs,
      artifact: (id) => (id === "export" ? file : null),
    };
    const action = agent.tool(
      "connection_request",
      {
        connection: id,
        method: "POST",
        route: "upload",
        artifactId: "export",
        uploadField: "file",
        body: { title: "My video" },
      },
      { playground },
    );
    agent.decide((await until(() => agent.snapshot().approvals[0])).id, true);
    await action;
    assert.match(observed.type, /multipart/);
    assert.match(observed.body.toString(), /fixture-video-bytes/);
    assert.match(observed.body.toString(), /My video/);
    assert(!JSON.stringify(agent.actions).includes("http-token"));
  } finally {
    await agent.close();
    await new Promise((r) => server.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("frame inspection returns actual PNG images to both provider tool formats, and web reads deny private URLs", async () => {
  const root = folder();
  try {
    fs.mkdirSync(path.join(root, "media"));
    const file = path.join(root, "media/video.mp4");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=purple:s=160x90:d=1",
      "-c:v",
      "libx264",
      "-y",
      file,
    ]);
    const result = await inspectFrame({
      workspace: root,
      project: {
        assets: [{ id: "source", path: "media/video.mp4", name: "Video" }],
      },
      playground: {},
      args: { assetId: "source", time: 0.2 },
    });
    const image = result.content.find((c) => c.type === "image");
    assert.equal(
      Buffer.from(image.data, "base64").subarray(1, 4).toString(),
      "PNG",
    );
    assert(
      codexContent(result).some(
        (c) =>
          c.type === "inputImage" && c.imageUrl.startsWith("data:image/png"),
      ),
    );
    await assert.rejects(readWeb("https://127.0.0.1/"), /private/);
    await assert.rejects(readWeb("http://example.com"), /HTTPS/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("real Streamable HTTP MCP negotiates sessions and uses the configured key", async () => {
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { StreamableHTTPServerTransport } =
    await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const { ListToolsRequestSchema, CallToolRequestSchema } =
    await import("@modelcontextprotocol/sdk/types.js");
  const { randomUUID } = await import("node:crypto");
  const root = folder(),
    agent = setup(root);
  let deleted = false;
  const mcp = new Server(
    { name: "remote-fixture", version: "1" },
    { capabilities: { tools: {} } },
  );
  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "read_remote",
        inputSchema: { type: "object" },
        annotations: { readOnlyHint: true },
      },
    ],
  }));
  mcp.setRequestHandler(CallToolRequestSchema, async () => ({
    content: [{ type: "text", text: "Remote MCP works" }],
  }));
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await mcp.connect(transport);
  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== "Bearer remote-fixture-key") {
      res.writeHead(401);
      res.end();
      return;
    }
    if (req.method === "DELETE") deleted = true;
    let body;
    if (req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      body = JSON.parse(raw);
    }
    await transport.handleRequest(req, res, body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const key = agent.secrets.put({
      name: "Remote key",
      value: "remote-fixture-key",
    });
    const id = await agent.connections.put({
      name: "Remote",
      type: "mcp",
      url: `http://127.0.0.1:${server.address().port}/mcp`,
      secretId: key,
    });
    assert.equal((await agent.connections.tools(id))[0].name, "read_remote");
    assert.match(
      (
        await agent.tool(
          "mcp_call",
          { connection: id, tool: "read_remote" },
          {},
        )
      ).content[0].text,
      /works/,
    );
    await agent.connections.disconnect(id);
    assert.equal(deleted, true);
  } finally {
    await agent.close();
    await mcp.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("generated tools use narrow sandboxed tickets and cannot follow symlinked tool/image/skill roots", async () => {
  const { inspectImage } = await import("../src/visual-inspection.mjs");
  const root = folder(),
    agent = setup(root);
  try {
    fs.mkdirSync(path.join(agent.workspace, "tools"));
    fs.writeFileSync(
      path.join(agent.workspace, "tools", "safe.html"),
      "<button>Safe</button>",
    );
    const link = await agent.tool("tool_open", { path: "tools/safe.html" }, {});
    const ticket = agent.ticket(link.id);
    assert.match(
      agent.ticketFile(
        new URL(ticket, "http://localhost").searchParams.get("ticket"),
      ),
      /safe\.html$/,
    );
    assert.throws(() => agent.ticketFile("missing"), /expired/);
    const outside = path.join(root, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "unsafe.html"), "Outside");
    fs.writeFileSync(path.join(outside, "secret.png"), "Not a real image");
    fs.rmSync(path.join(agent.workspace, "tools"), { recursive: true });
    fs.symlinkSync(outside, path.join(agent.workspace, "tools"));
    await assert.rejects(
      agent.tool("tool_open", { path: "tools/unsafe.html" }, {}),
      /symlink/,
    );
    fs.symlinkSync(outside, path.join(agent.workspace, "assets"));
    await assert.rejects(
      inspectImage(agent.workspace, "assets/secret.png"),
      /symlink/,
    );
    fs.rmSync(path.join(agent.workspace, "skills"), { recursive: true });
    fs.symlinkSync(outside, path.join(agent.workspace, "skills"));
    assert(!agent.skills.catalog().some((s) => s.scope === "project"));
  } finally {
    await agent.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("chat drafts survive app reopen without becoming agent context", async () => {
  const { startApp } = await import("../src/server.mjs");
  const root = folder();
  let app;
  const factory = () => ({
    async start() {},
    async account() {
      return { connected: true };
    },
    close() {},
  });
  try {
    app = await startApp({ workspace: root, providerFactory: factory });
    const r = await fetch(app.url + "/chat/draft", {
      method: "POST",
      headers: { Authorization: "Bearer " + app.token },
      body: JSON.stringify({ text: "Unsent user draft" }),
    });
    assert.equal(r.status, 200);
    assert(!JSON.stringify(app.agent.context()).includes("Unsent user draft"));
    await app.close();
    app = await startApp({ workspace: root, providerFactory: factory });
    const state = await fetch(app.url + "/chat/state", {
      headers: { Authorization: "Bearer " + app.token },
    }).then((r) => r.json());
    assert.equal(state.draft, "Unsent user draft");
    assert.deepEqual(state.messages, []);
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
