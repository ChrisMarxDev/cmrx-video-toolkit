import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
export class Connections {
  constructor({ root, secrets, onChange = () => {} }) {
    this.file = path.join(root, "connections.json");
    this.secrets = secrets;
    this.onChange = onChange;
    this.clients = new Map();
    this.transports = new Map();
    this.requests = new Set();
    this.statuses = new Map();
    try {
      this.entries = JSON.parse(fs.readFileSync(this.file));
    } catch {
      this.entries = [];
    }
  }
  list() {
    this.reload();
    return this.entries.map((e) => ({
      ...e,
      status: this.statuses.get(e.id) || "Not connected",
    }));
  }
  async put(value) {
    this.reload();
    const {
      id,
      name,
      type,
      url,
      command,
      args = [],
      secretId = "",
      header = "Authorization",
      envName = "API_KEY",
    } = value;
    if (
      !["mcp", "http", "stdio"].includes(type) ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 100
    )
      throw Error("Enter a name and connection type");
    if (type === "stdio") {
      if (
        typeof command !== "string" ||
        !path.isAbsolute(command) ||
        !fs.statSync(command).isFile() ||
        !Array.isArray(args) ||
        args.some((x) => typeof x !== "string")
      )
        throw Error("Choose a local executable and valid arguments");
    } else {
      const u = new URL(url);
      if (
        u.username ||
        u.password ||
        u.hash ||
        u.search ||
        !(
          u.protocol === "https:" ||
          (u.protocol === "http:" &&
            ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))
        )
      )
        throw Error(
          "Use an HTTPS address, or a local HTTP address, without credentials or query keys",
        );
    }
    if (secretId) this.secrets.get(secretId);
    if (!/^[\w-]{1,80}$/.test(header) || !/^\w{1,80}$/.test(envName))
      throw Error("Invalid key header or environment name");
    const entry = {
      id: id || randomUUID(),
      name: name.trim(),
      type,
      ...(type === "stdio" ? { command, args } : { url: new URL(url).href }),
      secretId,
      header,
      envName,
    };
    await this.disconnect(entry.id);
    this.entries = [...this.entries.filter((e) => e.id !== entry.id), entry];
    this.save();
    return entry.id;
  }
  save() {
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.entries), {
      mode: 0o600,
    });
    fs.renameSync(this.file + ".tmp", this.file);
    this.onChange();
  }
  entry(id) {
    this.reload();
    const e = this.entries.find((e) => e.id === id);
    if (!e) throw Error("Connection not found");
    return e;
  }
  headers(e) {
    if (!e.secretId) return {};
    const value = this.secrets.get(e.secretId);
    return {
      [e.header]:
        e.header.toLowerCase() === "authorization" ? "Bearer " + value : value,
    };
  }
  async client(id) {
    this.reload();
    if (this.clients.has(id)) return this.clients.get(id);
    const e = this.entry(id);
    if (e.type === "http")
      throw Error("This is an HTTP connection, use connection_request");
    const client = new Client(
      { name: "cmrx-project-agent", version: "0.1.0" },
      { capabilities: {} },
    );
    const transport =
      e.type === "stdio"
        ? new StdioClientTransport({
            command: e.command,
            args: e.args,
            cwd: path.dirname(this.file),
            env: {
              PATH: process.env.PATH || "/usr/bin",
              HOME: path.dirname(this.file),
              ...(e.secretId
                ? { [e.envName]: this.secrets.get(e.secretId) }
                : {}),
            },
            stderr: "pipe",
          })
        : new StreamableHTTPClientTransport(new URL(e.url), {
            requestInit: { headers: this.headers(e) },
          });
    this.transports.set(id, transport);
    transport.stderr?.resume();
    const task = (async () => {
      try {
        await client.connect(transport, { timeout: 15000 });
        this.statuses.set(id, "Connected");
        this.onChange();
        return client;
      } catch (error) {
        this.clients.delete(id);
        this.transports.delete(id);
        await client.close().catch(() => {});
        this.statuses.set(id, "Connection failed");
        this.onChange();
        throw Error(
          "Connection failed. Check its address, key and required runtime.",
        );
      }
    })();
    this.clients.set(id, task);
    return task;
  }
  async tools(id) {
    const client = await this.client(id);
    const result = [];
    let cursor;
    do {
      const r = await client.listTools(cursor ? { cursor } : {});
      result.push(...r.tools);
      cursor = r.nextCursor;
    } while (cursor && result.length < 500);
    return result;
  }
  async call(id, tool, args) {
    const client = await this.client(id);
    const controller = new AbortController();
    this.requests.add(controller);
    try {
      return await client.callTool(
        { name: tool, arguments: args || {} },
        undefined,
        {
          timeout: 120000,
          signal: controller.signal,
        },
      );
    } finally {
      this.requests.delete(controller);
    }
  }
  async resources(id) {
    const c = await this.client(id);
    return {
      resources: (await c.listResources()).resources,
      templates: (await c.listResourceTemplates()).resourceTemplates,
    };
  }
  async read(id, uri) {
    return (await this.client(id)).readResource({ uri });
  }
  async prompts(id) {
    return (await this.client(id)).listPrompts();
  }
  async prompt(id, name, args) {
    return (await this.client(id)).getPrompt({ name, arguments: args });
  }
  async request(id, { method = "GET", route = "", body, file, uploadField }) {
    const e = this.entry(id);
    if (e.type !== "http") throw Error("Use an HTTP connection");
    if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(method))
      throw Error("Unsupported method");
    const base = new URL(e.url),
      url = new URL(route, base.href.endsWith("/") ? base : base.href + "/");
    if (
      url.origin !== base.origin ||
      !(
        url.pathname === base.pathname ||
        url.pathname.startsWith(base.pathname.replace(/\/$/, "") + "/")
      )
    )
      throw Error("Request must stay within the configured connection address");
    let payload, contentType;
    if (file) {
      if (!["POST", "PUT", "PATCH"].includes(method))
        throw Error("Choose POST, PUT or PATCH to upload a render");
      const blob = await fs.openAsBlob(file, { type: "video/mp4" });
      if (uploadField) {
        if (!/^[\w-]{1,80}$/.test(uploadField))
          throw Error("Invalid upload field");
        const form = new FormData();
        form.append(uploadField, blob, "video.mp4");
        if (body && typeof body === "object")
          for (const [key, value] of Object.entries(body))
            form.append(
              key,
              typeof value === "string" ? value : JSON.stringify(value),
            );
        payload = form;
      } else {
        payload = blob;
        contentType = "video/mp4";
      }
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      contentType = "application/json";
    }
    const controller = new AbortController();
    this.requests.add(controller);
    try {
      const r = await fetch(url, {
        method,
        headers: {
          ...this.headers(e),
          ...(contentType ? { "Content-Type": contentType } : {}),
        },
        ...(payload !== undefined ? { body: payload } : {}),
        redirect: "error",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(file ? 600000 : 60000),
        ]),
      });
      const reader = r.body?.getReader();
      const decoder = new TextDecoder();
      let text = "",
        bytes = 0;
      if (reader)
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            if (bytes > 2000000) throw Error("Response is too large");
            text += decoder.decode(value, { stream: true });
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
      text += decoder.decode();
      return { status: r.status, body: this.secrets.redact(text) };
    } finally {
      this.requests.delete(controller);
    }
  }
  async test(id) {
    const e = this.entry(id);
    if (e.type === "http") {
      const r = await this.request(id, { method: "GET" });
      this.statuses.set(id, r.status < 400 ? "Connected" : `HTTP ${r.status}`);
      this.onChange();
      return { status: r.status };
    }
    await this.disconnect(id);
    return { tools: await this.tools(id) };
  }
  async disconnect(id) {
    const task = this.clients.get(id),
      transport = this.transports.get(id);
    this.clients.delete(id);
    this.transports.delete(id);
    if (task)
      try {
        const client = await task;
        if (transport?.terminateSession) {
          const timer = setTimeout(
            () => transport.close().catch(() => {}),
            3000,
          );
          try {
            await transport.terminateSession();
          } catch {
          } finally {
            clearTimeout(timer);
          }
        }
        await client.close();
      } catch {}
    this.statuses.delete(id);
  }
  async remove(id) {
    this.reload();
    await this.disconnect(id);
    this.entries = this.entries.filter((e) => e.id !== id);
    this.save();
  }
  cancel() {
    for (const controller of this.requests) controller.abort();
  }
  reload() {
    try {
      const stamp = fs.statSync(this.secrets.file).mtimeMs;
      if (this.secretStamp && this.secretStamp !== stamp)
        for (const id of this.clients.keys())
          this.disconnect(id).catch(() => {});
      this.secretStamp = stamp;
    } catch {}
    let next;
    try {
      next = JSON.parse(fs.readFileSync(this.file));
    } catch {
      return;
    }
    for (const old of this.entries)
      if (
        JSON.stringify(old) !==
        JSON.stringify(next.find((e) => e.id === old.id))
      )
        this.disconnect(old.id).catch(() => {});
    this.entries = next;
  }
  async close() {
    this.cancel();
    await Promise.allSettled(
      [...this.clients.keys()].map((id) => this.disconnect(id)),
    );
  }
}
