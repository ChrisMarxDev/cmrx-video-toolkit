import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { randomUUID } from "node:crypto";
import { agentInstructions } from "./agent-instructions.mjs";
import { tools } from "./tools.mjs";
export class ClaudeProvider {
  constructor({
    home,
    cwd,
    onEvent,
    command = process.env.CHAT_CLAUDE || "claude",
    connectionFile,
  }) {
    Object.assign(this, { home, cwd, onEvent, command, connectionFile });
    this.generation = 0;
    this.sessionFile = path.join(cwd, ".editor/provider-sessions/claude.json");
  }
  env() {
    return {
      ...process.env,
      CLAUDE_CONFIG_DIR: this.home,
      DISABLE_AUTOUPDATER: "1",
    };
  }
  async commandResult(args) {
    return new Promise((resolve, reject) => {
      const p = spawn(this.command, args, {
        cwd: this.cwd,
        env: this.env(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      p.stdout.on("data", (d) => {
        out = (out + d).slice(-100000);
      });
      p.stderr.resume();
      const timer = setTimeout(() => p.kill(), 15000);
      p.on("error", (e) => {
        clearTimeout(timer);
        reject(
          Error(
            e.code === "ENOENT"
              ? "The Claude engine couldn't start. Open Settings and try Connect again."
              : e.message,
          ),
        );
      });
      p.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, output: out });
      });
    });
  }
  async start() {
    fs.mkdirSync(this.home, { recursive: true, mode: 0o700 });
    const r = await this.commandResult(["--version"]);
    if (r.code !== 0) throw Error("Claude Code could not start");
    this.version = r.output.trim();
    const v = this.version.match(/(\d+)\.(\d+)\.(\d+)/);
    if (
      !v ||
      Number(v[1]) < 2 ||
      (Number(v[1]) === 2 &&
        (Number(v[2]) < 1 || (Number(v[2]) === 1 && Number(v[3]) < 318)))
    )
      throw Error(
        "Claude Code 2.1.318 or newer is required. Update it, then check the connection again.",
      );
  }
  async account() {
    const r = await this.commandResult(["auth", "status", "--json"]);
    let a;
    try {
      a = JSON.parse(r.output);
    } catch {
      throw Error("Claude Code could not report its sign-in state");
    }
    return {
      connected: !!a.loggedIn,
      plan: a.subscriptionType || null,
      authMethod: a.authMethod || null,
      version: this.version,
    };
  }
  async models() {
    return [
      {
        id: "default",
        name: "Claude default",
        description: "Your account’s recommended model",
        isDefault: true,
        efforts: [],
      },
      {
        id: "sonnet",
        name: "Claude Sonnet",
        description: "Latest Sonnet available through Claude Code",
        efforts: ["low", "medium", "high"],
        defaultEffort: "medium",
      },
      {
        id: "opus",
        name: "Claude Opus",
        description: "Latest Opus available through Claude Code",
        efforts: ["low", "medium", "high"],
        defaultEffort: "high",
      },
      {
        id: "haiku",
        name: "Claude Haiku",
        description: "Latest Haiku available through Claude Code",
        efforts: [],
      },
    ];
  }
  async login({ method = "subscription" } = {}) {
    if (this.loginProcess) throw Error("Claude sign-in is already open");
    if (!["subscription", "console"].includes(method))
      throw Error("Unknown Claude sign-in method");
    this.loginCancelled = false;
    return new Promise((resolve, reject) => {
      let found = false,
        buffer = "";
      const p = spawn(
        this.command,
        ["auth", "login", method === "console" ? "--console" : "--claudeai"],
        {
          cwd: this.cwd,
          env: { ...this.env(), BROWSER: "echo" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      this.loginProcess = p;
      const timer = setTimeout(() => {
        if (!found) {
          p.kill();
          reject(
            Error(
              "Claude Code did not provide a browser sign-in link. Retry sign-in.",
            ),
          );
        }
      }, 60000);
      const inspect = (d) => {
        buffer = (buffer + stripVTControlCharacters(d.toString())).slice(
          -20000,
        );
        for (const match of buffer.matchAll(/https:\/\/[^\s<>"']+/g)) {
          try {
            const u = new URL(match[0]);
            if (
              !found &&
              [
                "claude.ai",
                "claude.com",
                "platform.claude.com",
                "console.anthropic.com",
                "accounts.anthropic.com",
              ].includes(u.hostname) &&
              /oauth|authorize/.test(u.pathname)
            ) {
              found = true;
              clearTimeout(timer);
              resolve({ authUrl: u.href });
            }
          } catch {}
        }
      };
      p.stdout.on("data", inspect);
      p.stderr.on("data", inspect);
      p.on("error", (e) => {
        clearTimeout(timer);
        this.loginProcess = null;
        reject(Error("Claude sign-in could not start: " + e.message));
      });
      p.on("close", (code) => {
        clearTimeout(timer);
        this.loginProcess = null;
        if (!found)
          reject(Error("Claude Code sign-in ended before opening a browser"));
        this.onEvent({
          type: "accountChanged",
          loginFinished: true,
          error:
            code !== 0 && !this.loginCancelled
              ? "Claude Code sign-in did not complete. Retry sign-in."
              : undefined,
        });
      });
    });
  }
  cancelLogin() {
    this.loginCancelled = true;
    this.loginProcess?.kill();
    this.loginProcess = null;
  }
  async logout() {
    this.cancelLogin();
    const r = await this.commandResult(["auth", "logout"]);
    if (r.code !== 0) throw Error("Claude Code could not sign out");
  }
  async prompt(text, context, { model = "default", effort } = {}) {
    if (this.process) throw Error("A Claude turn is already running");
    const generation = ++this.generation;
    let account;
    try {
      account = await this.account();
    } catch (error) {
      if (generation !== this.generation) return;
      throw error;
    }
    if (generation !== this.generation) return;
    if (!account.connected)
      throw Error("Connect Claude Code in settings first");
    const config = {
      mcpServers: {
        editor: {
          command: process.execPath,
          args: [fileURLToPath(new URL("./tool-bridge.mjs", import.meta.url))],
          env: {
            ELECTRON_RUN_AS_NODE: "1",
            CHAT_EDITOR_CONNECTION: this.connectionFile,
          },
        },
      },
    };
    let saved;
    try {
      saved = JSON.parse(fs.readFileSync(this.sessionFile));
    } catch {}
    const args = [
      "--restricted",
      "-p",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--tools",
      "WebSearch,WebFetch",
      "--system-prompt-snapshot",
      "off",
      "--permission-mode",
      "dontAsk",
      "--permission-prompts",
      "none",
      "--setting-sources",
      "",
      "--disable-slash-commands",
      "--strict-mcp-config",
      "--mcp-config",
      JSON.stringify(config),
      "--allowedTools",
      "WebSearch",
      "WebFetch",
      ...tools.map((t) => "mcp__editor__" + t.name),
      "--system-prompt",
      agentInstructions +
        " The editor tools are exposed with the mcp__editor__ prefix in Claude Code. Use those corresponding functions.",
      "--model",
      model,
    ];
    if (effort) args.push("--effort", effort);
    if (saved?.sessionId) args.push("--resume", saved.sessionId);
    else args.push("--session-id", randomUUID());
    const p = spawn(this.command, args, {
      cwd: this.cwd,
      env: this.env(),
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = p;
    this.interrupted = false;
    let completed = false,
      resultSeen = false,
      resultError,
      currentId,
      streamed = new Set(),
      diagnostic = "";
    const finish = (error) => {
      if (completed) return;
      completed = true;
      this.onEvent({ type: "complete", ...(error ? { error } : {}) });
    };
    p.stderr.on("data", (d) => {
      diagnostic = (diagnostic + d).slice(-3000);
    });
    createInterface({ input: p.stdout }).on("line", (line) => {
      let m;
      try {
        m = JSON.parse(line);
      } catch {
        return;
      }
      if (m.session_id) {
        fs.mkdirSync(path.dirname(this.sessionFile), { recursive: true });
        fs.writeFileSync(
          this.sessionFile,
          JSON.stringify({ provider: "claude", sessionId: m.session_id }),
          { mode: 0o600 },
        );
      }
      if (m.type === "stream_event") {
        if (m.event?.type === "message_start") currentId = m.event.message?.id;
        if (
          m.event?.type === "content_block_delta" &&
          m.event.delta?.type === "text_delta"
        ) {
          streamed.add(currentId);
          this.onEvent({
            type: "delta",
            text: m.event.delta.text,
            itemId: currentId,
          });
        }
      }
      if (m.type === "assistant") {
        if (!streamed.has(m.message?.id))
          for (const block of m.message?.content || [])
            if (block.type === "text")
              this.onEvent({
                type: "delta",
                text: block.text,
                itemId: m.message?.id,
              });
      }
      if (m.type === "result") {
        resultSeen = true;
        resultError = m.is_error
          ? (
              m.errors || [m.result || "Claude could not complete the turn"]
            ).join("\n")
          : undefined;
      }
    });
    p.on("error", (e) => {
      this.process = null;
      finish(e.message);
    });
    p.on("close", (code) => {
      this.process = null;
      finish(
        this.interrupted
          ? undefined
          : resultSeen
            ? resultError
            : /unknown option|unknown flag/i.test(diagnostic)
              ? "Update Claude Code, then check the connection in settings."
              : "Claude Code stopped before completing the turn. Check its connection in settings and try again.",
      );
    });
    p.stdin.on("error", () => {});
    p.stdin.end(
      text +
        "\n\nCurrent project and portable conversation context:\n" +
        JSON.stringify(context),
    );
  }
  get running() {
    return !!this.process;
  }
  async stop() {
    this.generation++;
    this.interrupted = true;
    const p = this.process;
    if (p) {
      try {
        process.kill(-p.pid, "SIGINT");
      } catch {}
      setTimeout(() => {
        if (this.process === p)
          try {
            process.kill(-p.pid, "SIGKILL");
          } catch {}
      }, 2000).unref();
    }
  }
  close() {
    this.cancelLogin();
    void this.stop();
  }
}
