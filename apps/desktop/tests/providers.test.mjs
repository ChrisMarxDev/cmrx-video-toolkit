import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startApp } from "../src/server.mjs";
import { ClaudeProvider } from "../src/claude.mjs";
const folder = () =>
  fs.mkdtempSync(
    path.join(
      process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
      "provider-editor-test-",
    ),
  );
const post = (app, route, body = {}) =>
  fetch(app.url + "/chat/" + route, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + app.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
async function state(app) {
  return fetch(app.url + "/chat/state", {
    headers: { Authorization: "Bearer " + app.token },
  }).then((r) => r.json());
}
async function idle(app) {
  for (let i = 0; i < 100; i++) {
    const s = await state(app);
    if (!s.busy) return s;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw Error("Turn did not complete");
}
test("provider/model switching preserves the project, preferences and handoff; busy and invalid switches reject", async () => {
  const root = folder(),
    events = new Map(),
    calls = [];
  let app;
  const factory = ({ id, onEvent }) => {
    events.set(id, onEvent);
    return {
      async start() {},
      async account() {
        return { connected: true };
      },
      async models() {
        return [
          {
            id: id + "-a",
            name: id + " A",
            isDefault: true,
            efforts: ["low", "high"],
            defaultEffort: "low",
          },
          { id: id + "-b", name: id + " B", efforts: [] },
        ];
      },
      async prompt(text, context, options) {
        calls.push({ id, text, context, options });
      },
      async stop() {
        await onEvent({ type: "complete" });
      },
      close() {},
    };
  };
  try {
    app = await startApp({ workspace: root, providerFactory: factory });
    await app.ready;
    assert.equal((await state(app)).connected, false);
    await post(app, "login", { provider: "chatgpt" });
    await post(app, "login", { provider: "claude" });
    await post(app, "model", { provider: "chatgpt", model: "chatgpt-a" });
    const original = fs.readFileSync(path.join(root, "project.json"), "utf8");
    assert.equal((await post(app, "settings")).status, 200);
    assert.equal(
      (await post(app, "model", { provider: "claude", model: "missing" }))
        .status,
      400,
    );
    assert.equal((await state(app)).provider, "chatgpt");
    assert.equal(
      (
        await post(app, "model", {
          provider: "claude",
          model: "claude-a",
          effort: "high",
        })
      ).status,
      200,
    );
    assert.equal(
      (await post(app, "send", { text: "Read my comments" })).status,
      200,
    );
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(calls.at(-1).id, "claude");
    assert.equal(calls.at(-1).options.model, "claude-a");
    assert.equal(calls.at(-1).options.effort, "high");
    assert.equal(
      calls.at(-1).context.recentConversation.at(-1).text,
      "Read my comments",
    );
    assert.equal(
      (await post(app, "model", { provider: "chatgpt", model: "chatgpt-b" }))
        .status,
      400,
    );
    await events.get("chatgpt")({ type: "complete" });
    assert.equal((await state(app)).busy, true);
    await events.get("claude")({
      type: "delta",
      text: "I can see your project.",
      itemId: "reply",
    });
    await events.get("claude")({ type: "complete" });
    assert.equal((await state(app)).messages.at(-1).provider, "claude");
    assert.equal(
      (await post(app, "tool", { name: "editor_context", args: {} })).status,
      400,
    );
    assert.equal(
      fs.readFileSync(path.join(root, "project.json"), "utf8"),
      original,
    );
    await app.close();
    app = await startApp({ workspace: root, providerFactory: factory });
    await app.ready;
    const restored = await state(app);
    assert.equal(restored.provider, "claude");
    assert.equal(restored.model, "claude-a");
    assert.equal(restored.effort, "high");
    assert.equal(restored.messages.at(-1).text, "I can see your project.");
  } finally {
    await app?.close();
    await new Promise((r) => setTimeout(r, 150));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("Claude CLI adapter routes real MCP tools to revision-checked editor; streams once and keeps native session separate", async () => {
  const root = folder(),
    command = path.join(root, "claude-fixture");
  let app;
  fs.writeFileSync(
    command,
    `#!/usr/bin/env node
const fs=require('node:fs'),cp=require('node:child_process'),rl=require('node:readline');const args=process.argv.slice(2);
if(args.includes('--version')){console.log('2.1.318 fixture');process.exit();}
if(args[0]==='auth'){console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai',subscriptionType:'max',email:'private-fixture@example.test'}));process.exit();}
fs.writeFileSync(${JSON.stringify(path.join(root, "argv.json"))},JSON.stringify(args));
const config=JSON.parse(args[args.indexOf('--mcp-config')+1]).mcpServers.editor;
const p=cp.spawn(config.command,config.args,{env:{...process.env,...config.env},stdio:['pipe','pipe','inherit']});let n=0;const pending=new Map();
rl.createInterface({input:p.stdout}).on('line',s=>{const m=JSON.parse(s);pending.get(m.id)?.(m);});
function call(method,params={}){return new Promise(resolve=>{const id=++n;pending.set(id,resolve);p.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\\n');});}
(async()=>{await call('initialize',{protocolVersion:'2024-11-05'});const tools=await call('tools/list');if(!tools.result.tools.some(t=>t.name==='workspace_write'))throw Error('Missing arbitrary source tool');const context=await call('tools/call',{name:'editor_context',arguments:{}});const c=JSON.parse(context.result.content[0].text);const edit=await call('tools/call',{name:'editor_edit',arguments:{operation:'clip',revision:c.project.revision,id:'graphic',patch:{duration:3}}});if(edit.result.isError)throw Error('Edit failed');
const id='native-message';console.log(JSON.stringify({type:'stream_event',event:{type:'message_start',message:{id}}}));console.log(JSON.stringify({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'Shortened through Claude.'}}}));console.log(JSON.stringify({type:'assistant',message:{id,content:[{type:'text',text:'Shortened through Claude.'}]}}));console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,session_id:'12345678-1234-4234-9234-123456789abc'}));p.kill();})().catch(e=>{console.error(e.message);p.kill();process.exitCode=1;});
`,
  );
  fs.chmodSync(command, 0o755);
  const workspace = path.join(root, "project");
  fs.mkdirSync(workspace);
  fs.writeFileSync(
    path.join(workspace, "project.json"),
    JSON.stringify({
      schemaVersion: 1,
      revision: 0,
      name: "Fixture",
      width: 640,
      height: 360,
      fps: 24,
      assets: [],
      clips: [
        {
          id: "graphic",
          kind: "custom",
          name: "Graphic",
          start: 0,
          in: 0,
          duration: 4,
          track: 0,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          muted: true,
        },
      ],
    }),
  );
  try {
    app = await startApp({
      workspace,
      providerFactory: (options) =>
        options.id === "claude"
          ? new ClaudeProvider({
              ...options,
              home: path.join(root, "claude-home"),
              command,
            })
          : {
              async start() {},
              async account() {
                return { connected: true };
              },
              close() {},
            },
    });
    await app.ready;
    await post(app, "login", { provider: "claude" });
    const settings = await (await post(app, "settings")).json();
    assert.equal(JSON.stringify(settings).includes("private-fixture"), false);
    assert.equal(
      (
        await post(app, "model", {
          provider: "claude",
          model: "sonnet",
          effort: "high",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post(app, "send", {
          text: "Shorten the graphic to three seconds",
        })
      ).status,
      200,
    );
    const s = await idle(app);
    assert.equal(s.error, null);
    assert.equal(s.messages.at(-1).text, "Shortened through Claude.");
    assert.equal(
      (await app.editor("/api/context")).project.clips[0].duration,
      3,
    );
    const args = JSON.parse(fs.readFileSync(path.join(root, "argv.json")));
    assert.equal(args[args.indexOf("--model") + 1], "sonnet");
    assert.equal(args[args.indexOf("--effort") + 1], "high");
    assert.equal(args[args.indexOf("--tools") + 1], "WebSearch,WebFetch");
    assert(args.includes("--restricted"));
    assert(args.includes("--strict-mcp-config"));
    const session = JSON.parse(
      fs.readFileSync(
        path.join(workspace, ".editor/provider-sessions/claude.json"),
      ),
    );
    assert.equal(session.sessionId, "12345678-1234-4234-9234-123456789abc");
  } finally {
    await app?.close();
    await new Promise((r) => setTimeout(r, 200));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("a signed-out runtime can connect even when its model catalog needs authentication", async () => {
  const { ProviderManager } = await import("../src/provider-manager.mjs");
  const root = folder();
  fs.mkdirSync(path.join(root, ".editor"));
  let connected = false;
  const m = new ProviderManager({
    workspace: root,
    onEvent() {},
    onTool() {},
    onChange() {},
    factory: () => ({
      async start() {},
      async account() {
        return { connected };
      },
      async models() {
        if (!connected) throw Error("Sign in first");
        return [
          {
            id: "real-model",
            name: "Real model",
            isDefault: true,
            efforts: [],
          },
        ];
      },
      async login() {
        connected = true;
        return { authUrl: "https://example.test/oauth" };
      },
      close() {},
    }),
  });
  try {
    await m.ensure("chatgpt");
    assert.equal(m.entries.get("chatgpt").available, true);
    assert.equal(m.entries.get("chatgpt").connected, false);
    assert.equal(m.selected.model, "default");
    await m.login("chatgpt");
    await m.refresh("chatgpt");
    assert.equal(m.entries.get("chatgpt").connected, true);
    assert.equal(m.selected.model, "real-model");
    assert.equal(m.entries.get("chatgpt").authenticating, false);
  } finally {
    m.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("stopping during connection preflight prevents a late prompt after a provider switch", async () => {
  const root = folder();
  let app, release, entered;
  const waiting = new Promise((r) => (entered = r));
  let reads = 0,
    prompts = 0;
  try {
    app = await startApp({
      workspace: root,
      providerFactory: () => ({
        get running() {
          return false;
        },
        async start() {},
        async account() {
          if (++reads === 2) {
            entered();
            await new Promise((r) => (release = r));
          }
          return { connected: true };
        },
        async prompt() {
          prompts++;
        },
        async stop() {},
        close() {},
      }),
    });
    await app.ready;
    await post(app, "login", { provider: "chatgpt" });
    const sending = post(app, "send", { text: "Canceled before it starts" });
    await waiting;
    await post(app, "stop");
    assert.equal((await state(app)).busy, false);
    await post(app, "login", { provider: "claude" });
    await post(app, "model", { provider: "claude", model: "default" });
    release();
    const reply = await (await sending).json();
    assert.equal(reply.canceled, true);
    assert.equal(prompts, 0);
    assert.deepEqual((await state(app)).messages, []);
    assert.equal((await state(app)).provider, "claude");
  } finally {
    release?.();
    await app?.close();
    await new Promise((r) => setTimeout(r, 150));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("comment-only turns snapshot pending feedback, reject stale notes and persist sent payloads", async () => {
  const root = folder(),
    calls = [];
  let app, complete, tool;
  const factory = ({ onEvent, onTool }) => {
    tool = onTool;
    complete = () => onEvent({ type: "complete" });
    return {
      async start() {},
      async account() {
        return { connected: true };
      },
      async models() {
        return [{ id: "test", name: "Test", isDefault: true }];
      },
      async prompt(text, context) {
        calls.push({ text, context });
      },
      close() {},
    };
  };
  try {
    app = await startApp({ workspace: root, providerFactory: factory });
    await app.ready;
    await post(app, "login", { provider: "chatgpt" });
    assert.equal((await post(app, "send", { text: "" })).status, 400);
    await app.editor("/api/comment", {
      revision: 0,
      body: "Make this title bigger",
      anchor: { type: "timeline", time: 0 },
    });
    const note = (await state(app)).pendingComments[0];
    assert.equal(note.body, "Make this title bigger");
    assert.equal(
      (await post(app, "send", { text: "", comments: [note] })).status,
      200,
    );
    await new Promise((r) => setTimeout(r, 40));
    assert.match(calls.at(-1).text, /Apply the attached timed comments/);
    assert.deepEqual(calls.at(-1).context.attachedComments, [note]);
    assert.deepEqual((await state(app)).pendingComments, []);
    assert.equal((await state(app)).messages.at(-1).text, "");
    await complete();
    await app.editor("/api/comment-update", {
      revision: 1,
      id: note.id,
      patch: { body: "Make it much bigger" },
    });
    const changed = (await state(app)).pendingComments[0];
    assert.equal(changed.body, "Make it much bigger");
    assert.equal(
      (await post(app, "send", { text: "", comments: [note] })).status,
      400,
    );
    assert.equal((await state(app)).busy, false);
    assert.equal(calls.length, 1);
    assert.equal(
      (await post(app, "send", { text: "Please do this", comments: [changed] }))
        .status,
      200,
    );
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(calls.at(-1).text, "Please do this");
    assert.match(calls.at(-1).context.commentWorkflow, /resolve it yourself/);
    await tool("editor_edit", {
      operation: "comment-update",
      revision: 2,
      id: note.id,
      patch: { status: "resolved" },
    });
    await complete();
    assert.equal(
      (await app.editor("/api/context")).project.comments[0].status,
      "resolved",
    );
    assert.deepEqual((await state(app)).pendingComments, []);
    await app.editor("/api/comment-update", {
      revision: 3,
      id: note.id,
      patch: { status: "open" },
    });
    assert.equal((await state(app)).pendingComments[0].id, note.id);
    await app.close();
    app = await startApp({ workspace: root, providerFactory: factory });
    await app.ready;
    const restored = await state(app);
    assert.equal(restored.pendingComments[0].id, note.id);
    assert.equal(restored.pendingComments[0].reopenedRevision, 4);
    assert.equal(restored.messages[0].comments[0].body, note.body);
    assert.equal(restored.messages[1].comments[0].body, changed.body);
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
