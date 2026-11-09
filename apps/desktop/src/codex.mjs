import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { agentInstructions } from "./agent-instructions.mjs";
import { codexContent, toolVersion } from "./tool-content.mjs";
import { tools } from "./tools.mjs";
// Provider boundary: only this adapter understands Codex JSON-RPC and native sessions.
export class CodexProvider {
  constructor({
    home,
    cwd,
    onEvent,
    onTool,
    command = process.env.CHAT_CODEX || "codex",
  }) {
    Object.assign(this, { home, cwd, onEvent, onTool, command });
    this.sessionFile = path.join(cwd, ".editor/provider-sessions/chatgpt.json");
    this.pending = new Map();
    this.next = 0;
  }
  async start() {
    fs.mkdirSync(this.home, { recursive: true, mode: 0o700 });
    this.process = spawn(
      this.command,
      [
        "-c",
        "features.shell_tool=false",
        "-c",
        "features.multi_agent=false",
        "-c",
        "features.view_image=false",
        "-c",
        "features.image_generation=false",
        "-c",
        'web_search="live"',
        "app-server",
        "--stdio",
      ],
      {
        cwd: this.cwd,
        env: {
          ...process.env,
          CODEX_HOME: this.home,
          OPENAI_API_KEY: "",
          ANTHROPIC_API_KEY: "",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    this.process.on("error", (e) =>
      this.fail(
        Error(
          e.code === "ENOENT"
            ? "The ChatGPT engine couldn't start. Open Settings and try Connect again."
            : e.message,
        ),
      ),
    );
    this.process.stdin.on("error", (e) => this.fail(e));
    this.process.on("exit", () =>
      this.fail(
        Error("ChatGPT connection stopped. Restart the app to reconnect."),
      ),
    );
    this.process.stderr.on("data", () => {}); // Runtime diagnostics may contain account data; never forward them to the renderer.
    createInterface({ input: this.process.stdout }).on("line", (line) => {
      try {
        this.receive(JSON.parse(line));
      } catch {}
    });
    await this.call("initialize", {
      clientInfo: { name: "cmrx_chat_editor", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: "initialized", params: {} });
  }
  send(value) {
    this.process.stdin.write(JSON.stringify(value) + "\n");
  }
  call(method, params = {}) {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error(method + " timed out"));
      }, 60000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  fail(error) {
    if (this.closing) return;
    this.failure = error;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.onEvent({ type: "error", message: error.message });
  }
  async receive(msg) {
    if (msg.method && msg.id !== undefined) {
      if (msg.method === "item/tool/call") {
        try {
          const value = await this.onTool(
            msg.params.tool,
            msg.params.arguments,
          );
          this.send({
            id: msg.id,
            result: {
              success: true,
              contentItems: codexContent(value),
            },
          });
        } catch (e) {
          this.send({
            id: msg.id,
            result: {
              success: false,
              contentItems: [{ type: "inputText", text: e.message }],
            },
          });
        }
      } else if (msg.method.includes("requestApproval")) {
        this.send({ id: msg.id, result: { decision: "decline" } });
        this.onEvent({
          type: "activity",
          text: "An unsupported system action was blocked. Use video editing tools.",
        });
      } else
        this.send({
          id: msg.id,
          error: { code: -32601, message: "Unsupported request" },
        });
    } else if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        msg.error ? p.reject(Error(msg.error.message)) : p.resolve(msg.result);
      }
    } else if (
      msg.method === "item/started" &&
      msg.params?.item?.type === "webSearch"
    )
      this.onEvent({ type: "activity", text: "Searching the web…" });
    else if (msg.method === "item/agentMessage/delta")
      this.onEvent({
        type: "delta",
        text: msg.params.delta,
        itemId: msg.params.itemId,
      });
    else if (msg.method === "turn/completed") {
      this.turn = null;
      this.onEvent({
        type: "complete",
        error: msg.params.turn?.error?.message,
      });
    } else if (msg.method === "error")
      this.onEvent({
        type: "error",
        message: msg.params.error?.message || "Agent error",
      });
    else if (msg.method === "account/login/completed") {
      this.loginId = null;
      this.onEvent({
        type: "accountChanged",
        loginFinished: true,
        error:
          !this.loginCancelled && msg.params.success === false
            ? msg.params.error || "ChatGPT sign-in did not complete"
            : undefined,
      });
    } else if (msg.method === "account/updated")
      this.onEvent({ type: "accountChanged" });
  }
  async account() {
    const result = await this.call("account/read", { refreshToken: false });
    return {
      connected: result.account?.type === "chatgpt",
      plan: result.account?.planType || null,
    };
  }
  async login() {
    this.loginCancelled = false;
    const login = await this.call("account/login/start", { type: "chatgpt" });
    this.loginId = login.loginId;
    return login;
  }
  async cancelLogin() {
    this.loginCancelled = true;
    if (this.loginId) {
      await this.call("account/login/cancel", { loginId: this.loginId });
      this.loginId = null;
    }
  }
  async models() {
    const models = [];
    let cursor;
    do {
      const r = await this.call("model/list", {
        limit: 100,
        includeHidden: false,
        ...(cursor ? { cursor } : {}),
      });
      models.push(
        ...r.data.map((m) => ({
          id: m.model,
          name: m.displayName,
          description: m.description || "",
          isDefault: m.isDefault,
          efforts:
            m.supportedReasoningEfforts?.map((e) => e.reasoningEffort) || [],
          defaultEffort: m.defaultReasoningEffort,
        })),
      );
      cursor = r.nextCursor;
    } while (cursor && models.length < 1000);
    return models;
  }
  async logout() {
    await this.call("account/logout");
    this.thread = null;
  }
  async prompt(text, context, { model, effort } = {}) {
    this.starting = true;
    try {
      this.interrupted = false;
      const account = await this.account();
      if (!account.connected)
        throw Error(
          "Connect your ChatGPT subscription first. API billing is not enabled.",
        );
      if (this.interrupted) throw Error("Stopped");
      if (!this.thread) {
        const options = {
          cwd: this.cwd,
          ...(model && model !== "default" ? { model } : {}),
          ephemeral: false,
          sandbox: "read-only",
          approvalPolicy: "untrusted",
          dynamicTools: tools,
          baseInstructions: agentInstructions,
        };
        let saved;
        try {
          saved = JSON.parse(
            fs.readFileSync(
              fs.existsSync(this.sessionFile)
                ? this.sessionFile
                : path.join(this.cwd, ".editor/provider-session.json"),
            ),
          );
        } catch {}
        let r;
        if (saved?.threadId && saved.toolVersion !== toolVersion)
          this.onEvent({
            type: "activity",
            text: "Refreshing agent tools; your project and chat stay available.",
          });
        if (saved?.threadId && saved.toolVersion === toolVersion) {
          const { ephemeral, dynamicTools, ...resumeOptions } = options;
          try {
            r = await this.call("thread/resume", {
              ...resumeOptions,
              threadId: saved.threadId,
            });
          } catch {
            this.onEvent({
              type: "activity",
              text: "Starting a new conversation; saved edits remain available.",
            });
          }
        }
        if (!r) r = await this.call("thread/start", options);
        this.thread = r.thread.id;
        fs.mkdirSync(path.dirname(this.sessionFile), { recursive: true });
        fs.writeFileSync(
          this.sessionFile,
          JSON.stringify({
            provider: "chatgpt",
            threadId: this.thread,
            toolVersion,
          }),
          { mode: 0o600 },
        );
      }
      if (this.interrupted) throw Error("Stopped");
      const r = await this.call("turn/start", {
        threadId: this.thread,
        ...(model && model !== "default" ? { model } : {}),
        ...(effort ? { effort } : {}),
        input: [
          {
            type: "text",
            text:
              text + "\n\nCurrent editor context:\n" + JSON.stringify(context),
          },
        ],
      });
      this.turn = r.turn.id;
      if (this.interrupted) await this.stop();
    } catch (error) {
      if (this.interrupted && !this.turn) {
        this.onEvent({ type: "complete" });
        return;
      }
      throw error;
    } finally {
      this.starting = false;
    }
  }
  get running() {
    return !!this.turn || !!this.starting;
  }
  async stop() {
    this.interrupted = true;
    if (this.turn)
      await this.call("turn/interrupt", {
        threadId: this.thread,
        turnId: this.turn,
      });
  }
  close() {
    this.closing = true;
    this.process?.kill();
  }
}
