import fs from "node:fs";
import path from "node:path";
import { createProvider } from "./providers.mjs";
import { RuntimeManager } from "./runtime-manager.mjs";
export class ProviderManager {
  constructor({
    workspace,
    home,
    claudeHome,
    connectionFile,
    factory,
    onEvent,
    onTool,
    onChange,
    runtimeManager = new RuntimeManager(),
    enabled,
  }) {
    Object.assign(this, {
      workspace,
      home,
      claudeHome,
      connectionFile,
      factory,
      onEvent,
      onTool,
      onChange,
      runtimeManager,
    });
    this.file = path.join(workspace, ".editor/chat-settings.json");
    this.clients = new Map();
    this.enabled = enabled || new Set();
    this.ownsEnabled = !enabled;
    this.entries = new Map(
      ["chatgpt", "claude"].map((id) => [
        id,
        {
          id,
          name: id === "chatgpt" ? "ChatGPT" : "Claude",
          connected: false,
          available: false,
          models: [],
          error: null,
          authenticating: false,
        },
      ]),
    );
    try {
      this.preferences = JSON.parse(fs.readFileSync(this.file));
    } catch {
      this.preferences = { provider: "chatgpt", models: {} };
    }
    if (!this.entries.has(this.preferences.provider))
      this.preferences.provider = "chatgpt";
    this.preferences.models ||= {};
  }
  get id() {
    return this.preferences.provider;
  }
  get selected() {
    return this.preferences.models[this.id] || {};
  }
  get active() {
    return this.clients.get(this.id)?.client;
  }
  snapshot() {
    return {
      provider: this.id,
      canSteer: typeof this.active?.steer === "function",
      model: this.selected.model || "",
      effort: this.selected.effort || "",
      providers: [...this.entries.values()].map((e) => ({
        ...e,
        selectedModel: this.preferences.models[e.id]?.model,
        selectedEffort: this.preferences.models[e.id]?.effort,
      })),
    };
  }
  persist() {
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.preferences), {
      mode: 0o600,
    });
    fs.renameSync(this.file + ".tmp", this.file);
  }
  async ensure(id) {
    if (!this.entries.has(id)) throw Error("Unknown provider");
    if (this.clients.has(id)) {
      await this.clients.get(id).ready;
      return this.clients.get(id).client;
    }
    const entry = this.entries.get(id);
    const options = {
      id,
      home: id === "chatgpt" ? this.home : this.claudeHome,
      cwd: this.workspace,
      connectionFile: this.connectionFile,
      onEvent: (e) => this.onEvent(e, id),
      onTool: (name, args) => this.onTool(name, args, id),
    };
    const handle = {};
    this.clients.set(id, handle);
    handle.ready = (async () => {
      try {
        if (!this.factory)
          options.command = await this.runtimeManager.prepare(
            id,
            (progress) => {
              entry.preparing = progress;
              this.onChange();
            },
          );
        const client = this.factory
          ? this.factory(options)
          : createProvider(id, options);
        handle.client = client;
        await client.start();
        entry.preparing = null;
        entry.available = true;
        await this.refresh(id, false);
        this.normalize(id);
      } catch (e) {
        entry.error = e.message;
        entry.available = false;
        entry.connected = false;
        entry.preparing = null;
        this.onChange();
        throw e;
      }
      this.onChange();
      return handle.client;
    })();
    await handle.ready;
    return handle.client;
  }
  normalize(id) {
    const entry = this.entries.get(id),
      saved = this.preferences.models[id];
    const model =
      entry.models.find((m) => m.id === saved?.model) ||
      entry.models.find((m) => m.isDefault) ||
      entry.models[0];
    if (model)
      this.preferences.models[id] = {
        model: model.id,
        effort: model.efforts?.includes(saved?.effort)
          ? saved.effort
          : model.defaultEffort || "",
      };
  }
  async refresh(id, ensure = true) {
    const client = ensure ? await this.ensure(id) : this.clients.get(id).client;
    const e = this.entries.get(id);
    try {
      Object.assign(e, await client.account());
      e.connected = !!e.connected && this.enabled.has(id);
    } catch (error) {
      e.error = error.message;
      e.connected = false;
      e.available = false;
      this.onChange();
      throw error;
    }
    e.error = null;
    try {
      e.models = client.models
        ? await client.models()
        : [{ id: "default", name: "Default", isDefault: true, efforts: [] }];
      e.catalogError = null;
    } catch (error) {
      e.catalogError = error.message;
      if (!e.models.length)
        e.models = [
          {
            id: "default",
            name: e.name + " default",
            isDefault: true,
            efforts: [],
          },
        ];
    }
    this.normalize(id);
    if (e.connected) e.authenticating = false;
    this.onChange();
    return e;
  }
  async retry(id) {
    const handle = this.clients.get(id);
    if (handle) {
      handle.client?.close();
      this.clients.delete(id);
    }
    return this.ensure(id);
  }
  async select({ provider, model, effort }) {
    if (!this.clients.has(provider))
      throw Error("Connect this provider in Settings first");
    await this.ensure(provider);
    const item = this.entries.get(provider).models.find((m) => m.id === model);
    if (!item) throw Error("Choose a model offered by this provider");
    if (effort && !item.efforts?.includes(effort))
      throw Error(
        "This reasoning level is not supported by the selected model",
      );
    const prior = this.preferences.models[provider];
    const level =
      effort === undefined && prior?.model === model ? prior.effort : effort;
    this.preferences.provider = provider;
    this.preferences.models[provider] = {
      model,
      effort: level || item.defaultEffort || "",
    };
    this.persist();
    this.onChange();
  }
  async login(id, options) {
    const e = this.entries.get(id);
    if (!e) throw Error("Unknown provider");
    if (e.authenticating || e.preparing)
      throw Error("Connection is already in progress");
    const needsRetry = !!e.error && !e.available;
    this.enabled.add(id);
    e.authenticating = true;
    e.error = null;
    this.onChange();
    try {
      const client = needsRetry ? await this.retry(id) : await this.ensure(id);
      if (!this.enabled.has(id)) throw Error("Connection canceled");
      this.preferences.provider = id;
      this.persist();
      if (e.connected) {
        e.authenticating = false;
        this.onChange();
        return {};
      }
      e.preparing = { phase: "connecting", text: "Opening secure sign-in…" };
      this.onChange();
      const result = await client.login(options);
      e.preparing = null;
      this.onChange();
      return result;
    } catch (error) {
      e.authenticating = false;
      e.preparing = null;
      e.error = error.message;
      this.onChange();
      throw error;
    }
  }
  async logout(id) {
    const client = await this.ensure(id);
    await client.logout?.();
    this.enabled.delete(id);
    await this.refresh(id);
  }
  async cancelLogin(id) {
    const e = this.entries.get(id);
    if (!e) throw Error("Unknown provider");
    this.enabled.delete(id);
    this.runtimeManager.cancel(id);
    await this.clients.get(id)?.client?.cancelLogin?.();
    e.authenticating = false;
    e.connected = false;
    this.onChange();
  }
  close() {
    if (this.ownsEnabled) this.enabled.clear();
    this.runtimeManager.close();
    for (const { client } of this.clients.values()) client?.close();
  }
}
