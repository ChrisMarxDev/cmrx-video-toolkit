import { createHash, randomUUID } from "node:crypto";
import {
  applyOperations,
  type Operation,
  type OperationContext,
} from "./operations.js";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { validate, clone, type Project } from "./model.js";
export class Fault extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export const atomic = (file: string, value: unknown) => {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(temp, file);
};
export type Transaction = {
  operationId?: string;
  actor?: string;
  label?: string;
};
export type Receipt = {
  operationId: string;
  actor: string;
  label: string;
  baseRevision: number;
  revision: number;
  createdAt: string;
  signature: string;
};
export class Workspace extends EventEmitter {
  state: {
    project: Project;
    history: Project[];
    cursor: number;
    receipts?: Receipt[];
  };
  error = "";
  file: string;
  meta: string;
  private timer: NodeJS.Timeout;
  private raw = "";
  constructor(
    public root: string,
    private hooks: OperationContext = {},
  ) {
    super();
    this.file = path.join(root, "project.json");
    this.meta = path.join(root, ".editor");
    fs.mkdirSync(this.meta, { recursive: true });
    const saved = path.join(this.meta, "state.json");
    if (fs.existsSync(saved))
      this.state = JSON.parse(fs.readFileSync(saved, "utf8"));
    else {
      const p = validate(JSON.parse(fs.readFileSync(this.file, "utf8")));
      this.state = { project: p, history: [clone(p)], cursor: 0 };
      atomic(saved, this.state);
    }
    validate(this.state.project);
    this.hooks.validate?.(this.state.project);
    this.raw = fs.readFileSync(this.file, "utf8");
    // Reconcile any offline edit against the last accepted persistent revision.
    this.raw = "";
    this.poll();
    this.timer = setInterval(() => this.poll(), 250);
  }
  get project() {
    return this.state.project;
  }
  persist() {
    atomic(path.join(this.meta, "state.json"), this.state);
  }
  poll() {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      if (raw === this.raw) return;
      this.raw = raw;
      const p = validate(JSON.parse(raw));
      if (JSON.stringify(p) === JSON.stringify(this.project)) {
        this.error = "";
        this.emit("change");
        return;
      }
      if (p.revision !== this.project.revision)
        throw new Fault(
          409,
          `File revision ${p.revision} is stale; accepted revision is ${this.project.revision}. Preserve your edits, then rebase on the accepted project.`,
        );
      this.accept(p, "External file edit");
    } catch (e) {
      this.error = (e as Error).message;
      this.emit("change");
    }
  }
  ensure(base: number) {
    this.poll();
    if (this.error)
      throw new Fault(
        409,
        `Resolve project.json before editing: ${this.error}`,
        {
          code: "external_document_conflict",
          currentRevision: this.project.revision,
          retry: "preserve-file-and-reconcile",
        },
      );
    if (!Number.isInteger(base) || base !== this.project.revision)
      throw new Fault(
        409,
        `Revision conflict: expected ${base}, current ${this.project.revision}. Refresh and reapply.`,
        {
          code: "revision_conflict",
          baseRevision: base ?? null,
          currentRevision: this.project.revision,
          latestTransaction: this.state.receipts?.at(-1) ?? null,
          retry: "refresh-and-reapply",
        },
      );
  }
  accept(p: Project, reason: string, history = true, transaction?: Receipt) {
    validate(p);
    this.hooks.validate?.(p);
    const next = clone(p);
    next.revision = this.project.revision + 1;
    // All calls are synchronous on one event loop. Preserve observed input before replacement.
    fs.mkdirSync(path.join(this.meta, "revisions"), { recursive: true });
    atomic(
      path.join(this.meta, "revisions", `${this.project.revision}.json`),
      this.project,
    );
    if (history) {
      this.state.history = this.state.history.slice(0, this.state.cursor + 1);
      this.state.history.push(clone(next));
      this.state.cursor = this.state.history.length - 1;
    }
    this.state.receipts = [
      ...(this.state.receipts ?? []),
      transaction ?? {
        operationId: randomUUID(),
        actor:
          reason === "External file edit"
            ? "external"
            : history
              ? "client"
              : "history",
        label: reason,
        baseRevision: this.project.revision,
        revision: next.revision,
        createdAt: new Date().toISOString(),
        signature: "",
      },
    ].slice(-500);
    this.state.project = next;
    this.persist();
    atomic(this.file, next);
    this.raw = fs.readFileSync(this.file, "utf8");
    this.error = "";
    this.emit("change", reason);
    return next;
  }
  transact(base: number, operations: Operation[], meta: Transaction = {}) {
    const signature = createHash("sha256")
      .update(
        JSON.stringify({
          base,
          operations,
          actor: meta.actor ?? "client",
          label: meta.label ?? "Document edit",
        }),
      )
      .digest("hex");
    if (
      meta.operationId !== undefined &&
      (typeof meta.operationId !== "string" ||
        !/^[\w:-]{1,120}$/.test(meta.operationId))
    )
      throw new Fault(400, "Invalid operation ID");
    if (
      (meta.actor !== undefined &&
        (typeof meta.actor !== "string" || meta.actor.length > 120)) ||
      (meta.label !== undefined &&
        (typeof meta.label !== "string" || meta.label.length > 200))
    )
      throw new Fault(400, "Invalid transaction metadata");
    const previous =
      meta.operationId &&
      this.state.receipts?.find((r) => r.operationId === meta.operationId);
    if (previous) {
      if (previous.signature !== signature)
        throw new Fault(409, "Operation ID already used with different input", {
          code: "operation_id_conflict",
          operationId: meta.operationId,
        });
      return { project: this.project, receipt: previous, replayed: true };
    }
    this.ensure(base);
    const receipt: Receipt = {
      operationId: meta.operationId ?? randomUUID(),
      actor: meta.actor ?? "client",
      label: meta.label ?? "Document edit",
      baseRevision: base,
      revision: base + 1,
      createdAt: new Date().toISOString(),
      signature,
    };
    const next = applyOperations(this.project, operations, this.hooks);
    return {
      project: this.accept(next, receipt.label, true, receipt),
      receipt,
      replayed: false,
    };
  }
  update(base: number, fn: (p: Project) => Project) {
    this.ensure(base);
    return this.accept(fn(clone(this.project)), "UI / agent edit");
  }
  travel(base: number, delta: number, meta: Transaction = {}) {
    if (
      (meta.actor !== undefined &&
        (typeof meta.actor !== "string" || meta.actor.length > 120)) ||
      (meta.label !== undefined &&
        (typeof meta.label !== "string" || meta.label.length > 200))
    )
      throw new Fault(400, "Invalid transaction metadata");
    const signature = createHash("sha256")
      .update(
        JSON.stringify({
          base,
          delta,
          actor: meta.actor ?? "client",
          label: meta.label ?? (delta < 0 ? "Undo" : "Redo"),
        }),
      )
      .digest("hex");
    const previous =
      meta.operationId &&
      this.state.receipts?.find((r) => r.operationId === meta.operationId);
    if (previous) {
      if (previous.signature !== signature)
        throw new Fault(409, "Operation ID already used with different input", {
          code: "operation_id_conflict",
        });
      return this.project;
    }
    if (
      meta.operationId !== undefined &&
      (typeof meta.operationId !== "string" ||
        !/^[\w:-]{1,120}$/.test(meta.operationId))
    )
      throw new Fault(400, "Invalid operation ID");
    this.ensure(base);
    const cursor = this.state.cursor + delta;
    if (cursor < 0 || cursor >= this.state.history.length)
      throw new Fault(400, "No history in that direction");
    const p = clone(this.state.history[cursor]);
    validate(p);
    this.hooks.validate?.(p);
    this.state.cursor = cursor;
    return this.accept(p, delta < 0 ? "Undo" : "Redo", false, {
      operationId: meta.operationId ?? randomUUID(),
      actor: meta.actor ?? "client",
      label: meta.label ?? (delta < 0 ? "Undo" : "Redo"),
      baseRevision: base,
      revision: base + 1,
      createdAt: new Date().toISOString(),
      signature,
    });
  }
  close() {
    clearInterval(this.timer);
  }
}
