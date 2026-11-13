import { randomUUID } from "node:crypto";
import {
  validate,
  clone,
  patchClip,
  patchLayer,
  chooseTake,
  splitClip,
  rippleDeleteRange,
  addComment,
  updateComment,
  type Project,
  type CommentAnchor,
  type TranscriptSegment,
} from "./model.js";
export type OperationContext = {
  command?: (project: Project, name: string) => Project;
  validate?: (project: Project) => void;
};
export type Operation =
  | { type: "extension"; name: string }
  | { type: "project"; project: Project }
  | { type: "clip"; id: string; patch: Parameters<typeof patchClip>[2] }
  | { type: "layer"; track: number; patch: Parameters<typeof patchLayer>[2] }
  | { type: "take-choice"; sectionId: string; takeId: string }
  | { type: "split"; id: string; time: number }
  | { type: "ripple-delete"; start: number; end: number }
  | { type: "delete"; id: string }
  | { type: "comment"; body: string; anchor: CommentAnchor }
  | {
      type: "comment-update";
      id: string;
      patch: Parameters<typeof updateComment>[2];
    }
  | { type: "transcript"; assetId: string; transcript: TranscriptSegment[] }
  | {
      type: "add";
      assetId: string;
      id?: string;
      start?: number;
      duration?: number;
      track?: number;
    }
  | {
      type: "add-graphics";
      source: string;
      duration: number;
      id?: string;
      name?: string;
      start?: number;
      track?: number;
    };
export const operationTypes = [
  "extension",
  "project",
  "clip",
  "layer",
  "take-choice",
  "split",
  "ripple-delete",
  "delete",
  "comment",
  "comment-update",
  "transcript",
  "add",
  "add-graphics",
] as const;
export function applyOperation(
  project: Project,
  op: Operation,
  context: OperationContext = {},
): Project {
  if (!op || typeof op !== "object" || !operationTypes.includes(op.type))
    throw Error("Unknown document operation");
  const p = clone(project);
  switch (op.type) {
    case "extension":
      if (!context.command) throw Error("Extension commands unavailable");
      return validate(context.command(p, op.name));
    case "project":
      return validate(clone(op.project));
    case "clip":
      return patchClip(p, op.id, op.patch);
    case "layer":
      return patchLayer(p, op.track, op.patch);
    case "take-choice":
      return chooseTake(p, op.sectionId, op.takeId);
    case "split":
      return splitClip(p, op.id, op.time);
    case "ripple-delete":
      return rippleDeleteRange(p, op.start, op.end);
    case "comment":
      return addComment(p, op.body, op.anchor);
    case "comment-update":
      return updateComment(p, op.id, op.patch);
    case "delete": {
      if (!p.clips.some((c) => c.id === op.id)) throw Error("Clip not found");
      p.clips = p.clips.filter((c) => c.id !== op.id);
      break;
    }
    case "transcript": {
      const asset = p.assets.find((a) => a.id === op.assetId);
      if (!asset) throw Error("Transcript source not found");
      asset.transcript = op.transcript;
      break;
    }
    case "add":
    case "add-graphics": {
      const asset =
        op.type === "add" ? p.assets.find((a) => a.id === op.assetId) : null;
      if (op.type === "add" && !asset) throw Error("Asset not found");
      p.clips.push({
        id: op.id || `clip-${randomUUID()}`,
        name: op.type === "add-graphics" ? op.name || "Graphics" : asset!.name,
        kind: op.type === "add" ? "video" : "graphics",
        ...(asset ? { assetId: asset.id } : {}),
        start: op.start ?? 0,
        in: 0,
        duration: op.duration ?? Math.min(4, asset!.duration),
        track: op.track ?? 0,
        x: 0,
        y: 0,
        width: p.width,
        height: p.height,
        muted: false,
        ...(op.type === "add-graphics" ? { props: { source: op.source } } : {}),
      });
      break;
    }
    default: {
      const exhaustive: never = op;
      throw Error(String(exhaustive));
    }
  }
  return validate(p);
}
export function applyOperations(
  project: Project,
  operations: Operation[],
  context: OperationContext = {},
) {
  if (
    !Array.isArray(operations) ||
    operations.length < 1 ||
    operations.length > 100
  )
    throw Error("Provide 1–100 document operations");
  const next = operations.reduce(
    (p, op) => applyOperation(p, op, context),
    clone(project),
  );
  context.validate?.(next);
  return next;
}
