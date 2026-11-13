export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  [key: string]: unknown;
};
export type MediaRepresentation = {
  path: string;
  sha256: string;
  width: number;
  height: number;
  duration: number;
  frameRate: string;
  rotation: number;
  transfer: string;
};
export type MediaRepresentations = {
  schemaVersion: 1;
  original: MediaRepresentation;
  render: MediaRepresentation;
  mapping: {
    timing: "identity" | "resampled";
    color: "identity" | "hdr-to-sdr";
    orientation: "identity" | "baked";
  };
};
export type Asset = {
  id: string;
  name: string;
  path: string;
  duration: number;
  audio: boolean;
  transcript?: TranscriptSegment[];
  media?: MediaRepresentations;
  [key: string]: unknown;
};
export type Clip = {
  id: string;
  name: string;
  kind: string;
  assetId?: string;
  start: number;
  in: number;
  duration: number;
  track: number;
  x: number;
  y: number;
  width: number;
  height: number;
  muted: boolean;
  volume?: number;
  props?: Record<string, unknown>;
  [key: string]: unknown;
};
export type LayerState = {
  muted?: boolean;
  disabled?: boolean;
  [key: string]: unknown;
};
export type TakeSection = {
  id: string;
  label: string;
  assetId: string;
  takes: {
    id: string;
    label: string;
    sourceStart: number;
    sourceEnd: number;
    [key: string]: unknown;
  }[];
  preferredTakeId?: string;
  [key: string]: unknown;
};
export type Project = {
  schemaVersion: 1;
  revision: number;
  name: string;
  width: number;
  height: number;
  fps: number;
  assets: Asset[];
  clips: Clip[];
  comments?: Comment[];
  layers?: Record<string, LayerState>;
  takeSections?: TakeSection[];
  [key: string]: unknown;
};
export type CommentAnchor =
  | { type: "timeline"; time: number; [key: string]: unknown }
  | {
      type: "clip";
      clipId: string;
      sourceTime: number;
      sourceAssetId?: string;
      [key: string]: unknown;
    };
export type Comment = {
  id: string;
  body: string;
  status: "open" | "resolved";
  createdRevision: number;
  reopenedRevision?: number;
  anchor: CommentAnchor;
  [key: string]: unknown;
};
// Derived only: never persist a second timeline time for a clip comment.
export function locateComment(
  p: Project,
  comment: Comment,
): {
  time: number | null;
  reason?:
    "missing-clip" | "trimmed-out" | "outside-timeline" | "source-changed";
} {
  const a = comment.anchor;
  if (a.type === "timeline")
    return a.time <= end(p)
      ? { time: a.time }
      : { time: null, reason: "outside-timeline" };
  const c = p.clips.find((c) => c.id === a.clipId);
  if (!c) return { time: null, reason: "missing-clip" };
  if (a.sourceAssetId !== undefined && a.sourceAssetId !== c.assetId)
    return { time: null, reason: "source-changed" };
  if (a.sourceTime < c.in || a.sourceTime >= c.in + c.duration)
    return { time: null, reason: "trimmed-out" };
  return { time: c.start + a.sourceTime - c.in };
}
export function addComment(
  p: Project,
  body: string,
  anchor: CommentAnchor,
): Project {
  const next = clone(p);
  const comment: Comment = {
    id: `comment-${crypto.randomUUID()}`,
    body,
    anchor: clone(anchor),
    status: "open",
    createdRevision: p.revision + 1,
  };
  if (comment.anchor.type === "clip") {
    const c = p.clips.find((c) => c.id === comment.anchor.clipId);
    if (comment.anchor.sourceAssetId === undefined && c?.assetId)
      comment.anchor.sourceAssetId = c.assetId;
  }
  // New comments must have a real target. Existing orphaned comments are retained.
  if (locateComment(p, comment).time === null)
    throw Error("Comment target is not visible in the timeline");
  next.comments = [...(next.comments ?? []), comment];
  return validate(next);
}
export function updateComment(
  p: Project,
  id: string,
  patch: { body?: string; status?: "open" | "resolved" },
): Project {
  const next = clone(p);
  const comment = next.comments?.find((c) => c.id === id);
  if (!comment) throw Error("Comment not found");
  if (patch.body !== undefined) comment.body = patch.body;
  if (patch.status === "open" && comment.status === "resolved")
    comment.reopenedRevision = p.revision + 1;
  if (patch.status !== undefined) comment.status = patch.status;
  return validate(next);
}
export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};
export type Job = {
  id: string;
  revision: number;
  status: string;
  progress: number;
  log: string;
  [key: string]: unknown;
  artifact?: string;
  error?: string;
};
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const end = (p: Project) =>
  Math.max(1, ...p.clips.map((c) => c.start + c.duration));
export function validate(p: Project): Project {
  const check = (ok: unknown, m: string) => {
    if (!ok) throw Error(m);
  };
  const num = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  check(p && p.schemaVersion === 1, "schemaVersion must be 1");
  check(
    Number.isInteger(p.revision) && p.revision >= 0,
    "revision must be a nonnegative integer",
  );
  check(
    typeof p.name === "string" && p.name.length <= 200,
    "Invalid project name",
  );
  check(
    num(p.width, 64, 3840) &&
      p.width % 2 === 0 &&
      num(p.height, 64, 3840) &&
      Math.min(p.width, p.height) <= 2160 &&
      p.height % 2 === 0,
    "Even canvas dimensions required (max 3840×2160 landscape or 2160×3840 portrait)",
  );
  check(Number.isInteger(p.fps) && num(p.fps, 1, 60), "fps must be 1–60");
  check(
    Array.isArray(p.assets) &&
      p.assets.length <= 100 &&
      Array.isArray(p.clips) &&
      p.clips.length <= 100,
    "At most 100 assets/clips",
  );
  if (p.layers !== undefined) {
    check(
      p.layers && typeof p.layers === "object" && !Array.isArray(p.layers),
      "Invalid layer settings",
    );
    for (const [track, layer] of Object.entries(p.layers)) {
      check(/^[0-7]$/.test(track), "Layer must be 0–7");
      check(
        layer && typeof layer === "object" && !Array.isArray(layer),
        "Invalid layer settings",
      );
      check(
        (layer.muted === undefined || typeof layer.muted === "boolean") &&
          (layer.disabled === undefined || typeof layer.disabled === "boolean"),
        "Invalid layer flags",
      );
    }
  }
  if (p.takeSections !== undefined) {
    check(
      Array.isArray(p.takeSections) && p.takeSections.length <= 100,
      "Invalid take sections",
    );
    const sectionIds = new Set<string>();
    for (const section of p.takeSections) {
      check(
        section &&
          typeof section.id === "string" &&
          /^[\w-]{1,80}$/.test(section.id) &&
          !sectionIds.has(section.id),
        "Invalid or duplicate take section ID",
      );
      sectionIds.add(section.id);
      const asset = p.assets.find((a) => a.id === section.assetId);
      check(
        asset &&
          typeof section.label === "string" &&
          section.label.length > 0 &&
          section.label.length <= 200,
        "Invalid take section source/label",
      );
      check(
        Array.isArray(section.takes) &&
          section.takes.length > 0 &&
          section.takes.length <= 100,
        "Invalid alternatives",
      );
      const ids = new Set<string>();
      for (const take of section.takes) {
        check(
          take &&
            typeof take.id === "string" &&
            /^[\w-]{1,80}$/.test(take.id) &&
            !ids.has(take.id),
          "Invalid or duplicate take ID",
        );
        ids.add(take.id);
        check(
          typeof take.label === "string" &&
            take.label.length > 0 &&
            take.label.length <= 200 &&
            num(take.sourceStart, 0, asset!.duration) &&
            num(take.sourceEnd, 0, asset!.duration) &&
            take.sourceEnd > take.sourceStart,
          "Invalid take source range",
        );
      }
      check(
        section.preferredTakeId === undefined ||
          ids.has(section.preferredTakeId),
        "Unknown preferred take",
      );
    }
  }
  const ids = new Set<string>();
  for (const item of [...p.assets, ...p.clips]) {
    check(
      typeof item.id === "string" &&
        /^[\w-]{1,80}$/.test(item.id) &&
        !ids.has(item.id),
      "IDs must be unique, alphanumeric/hyphen/underscore",
    );
    ids.add(item.id);
  }
  for (const a of p.assets) {
    check(
      typeof a.path === "string" &&
        a.path.startsWith("media/") &&
        !a.path.includes("..") &&
        !a.path.includes("\\"),
      "Assets must use relative media/ paths",
    );
    check(
      num(a.duration, 0.01, 7200) && typeof a.audio === "boolean",
      "Invalid asset metadata",
    );
  }
  for (const asset of p.assets) {
    if (asset.media !== undefined) {
      const m = asset.media;
      check(m?.schemaVersion === 1, "Unsupported media representations");
      for (const r of [m.original, m.render])
        check(
          r &&
            typeof r.path === "string" &&
            r.path.startsWith("media/") &&
            !r.path.includes("..") &&
            !r.path.includes("\\") &&
            /^[a-f0-9]{64}$/.test(r.sha256) &&
            num(r.width, 1, 32768) &&
            num(r.height, 1, 32768) &&
            num(r.duration, 0.001, 86400) &&
            typeof r.frameRate === "string" &&
            Number.isFinite(r.rotation) &&
            typeof r.transfer === "string",
          "Invalid media representation",
        );
      check(
        m.render.path === asset.path,
        "Asset path must identify its render input",
      );
      check(
        m.mapping &&
          ["identity", "resampled"].includes(m.mapping.timing) &&
          ["identity", "hdr-to-sdr"].includes(m.mapping.color) &&
          ["identity", "baked"].includes(m.mapping.orientation),
        "Invalid media mapping",
      );
    }

    if (asset.transcript === undefined) continue;
    check(
      Array.isArray(asset.transcript) && asset.transcript.length <= 5000,
      "At most 5000 transcript segments per source",
    );
    let previous = -1;
    for (const cue of asset.transcript) {
      check(
        cue &&
          num(cue.start, 0, asset.duration) &&
          num(cue.end, 0, asset.duration) &&
          cue.end > cue.start,
        "Transcript times must be within the source and end after start",
      );
      check(
        cue.start >= previous,
        "Transcript segments must be ordered by source time",
      );
      check(
        typeof cue.text === "string" &&
          cue.text.trim().length > 0 &&
          cue.text.length <= 10000,
        "Invalid transcript text",
      );
      previous = cue.start;
    }
  }
  for (const c of p.clips) {
    check(
      typeof c.name === "string" && typeof c.kind === "string",
      "Invalid clip name/kind",
    );
    check(
      num(c.start, 0, 600) &&
        num(c.duration, 1 / p.fps, 600) &&
        c.start + c.duration <= 600,
      "Clip must fit within 10 minutes",
    );
    check(
      num(c.in, 0, 7200) && Number.isInteger(c.track) && num(c.track, 0, 7),
      "Invalid source offset or track",
    );
    check(
      num(c.x, -4 * p.width, p.width) &&
        num(c.y, -4 * p.height, p.height) &&
        num(c.width, 2, 4 * p.width) &&
        num(c.height, 2, 4 * p.height) &&
        c.x < p.width &&
        c.y < p.height &&
        c.x + c.width > 0 &&
        c.y + c.height > 0,
      "Clip rectangle must intersect canvas and stay within 4× canvas size",
    );
    check(typeof c.muted === "boolean", "muted must be boolean");
    check(
      c.volume === undefined || num(c.volume, 0, 16),
      "Clip volume must be 0–16 (linear gain)",
    );
    if (c.kind === "graphics") {
      const source = c.props?.source;
      check(
        typeof source === "string" &&
          /^lib\/[a-zA-Z0-9_/.-]+\.dart$/.test(source) &&
          !source.split("/").some((s) => s.startsWith(".")),
        "Graphics source must be a Dart file under lib/",
      );
    }
    if (c.kind === "video") {
      const a = p.assets.find((a) => a.id === c.assetId);
      check(
        a && c.in + c.duration <= a.duration + 0.001,
        "Video trim exceeds source handles",
      );
    }
  }
  check(
    p.comments === undefined ||
      (Array.isArray(p.comments) && p.comments.length <= 1000),
    "At most 1000 comments",
  );
  for (const c of p.comments ?? []) {
    check(c && typeof c === "object", "Invalid comment");
    check(
      typeof c.id === "string" && /^[\w-]{1,80}$/.test(c.id) && !ids.has(c.id),
      "Comment IDs must be unique",
    );
    ids.add(c.id);
    check(
      typeof c.body === "string" &&
        c.body.trim().length > 0 &&
        c.body.length <= 10000,
      "Comment body must contain 1–10000 characters",
    );
    check(
      c.status === "open" || c.status === "resolved",
      "Invalid comment status",
    );
    check(
      Number.isSafeInteger(c.createdRevision) && c.createdRevision >= 0,
      "Invalid comment creation revision",
    );
    check(
      c.reopenedRevision === undefined ||
        (Number.isSafeInteger(c.reopenedRevision) && c.reopenedRevision >= 0),
      "Invalid comment reopen revision",
    );
    const a = c.anchor;
    check(a && typeof a === "object", "Comment anchor required");
    if (a.type === "timeline")
      check(num(a.time, 0, 600), "Invalid timeline comment time");
    else {
      check(
        a.type === "clip" &&
          typeof a.clipId === "string" &&
          /^[\w-]{1,80}$/.test(a.clipId) &&
          num(a.sourceTime, 0, 7800),
        "Invalid clip comment anchor",
      );
      check(
        a.sourceAssetId === undefined ||
          (typeof a.sourceAssetId === "string" &&
            /^[\w-]{1,80}$/.test(a.sourceAssetId)),
        "Invalid comment source asset",
      );
    }
  }
  return p;
}
export function patchClip(
  p: Project,
  id: string,
  patch: Partial<Clip>,
): Project {
  const next = clone(p),
    c = next.clips.find((c) => c.id === id);
  if (!c) throw Error("Clip not found");
  Object.assign(c, patch);
  return validate(next);
}
export function splitClip(p: Project, id: string, time: number): Project {
  const next = clone(p),
    c = next.clips.find((c) => c.id === id);
  if (!c) throw Error("Clip not found");
  const left = Math.round((time - c.start) * p.fps) / p.fps;
  if (left < 1 / p.fps || c.duration - left < 1 / p.fps)
    throw Error("Playhead must be inside the clip");
  const right = {
    ...clone(c),
    id: `clip-${crypto.randomUUID()}`,
    start: c.start + left,
    in: c.in + left,
    duration: c.duration - left,
  };
  next.clips.push(right);
  for (const comment of next.comments ?? []) {
    const a = comment.anchor;
    if (a.type === "clip" && a.clipId === id && a.sourceTime >= right.in)
      a.clipId = right.id;
  }
  c.duration = left;
  return validate(next);
}
/** Remove project time across all tracks, preserving source clocks and metadata. */
export function rippleDeleteRange(
  p: Project,
  from: number,
  to: number,
): Project {
  if (!Number.isFinite(from) || !Number.isFinite(to))
    throw Error("Invalid range");
  const frame = 1 / p.fps;
  const start = Math.round(Math.min(from, to) * p.fps) / p.fps;
  const stop = Math.round(Math.max(from, to) * p.fps) / p.fps;
  if (start < 0 || stop > end(p) + frame / 2 || stop - start < frame - 1e-8)
    throw Error("Select at least one frame within the timeline");
  const next = clone(p),
    removed = stop - start;
  next.clips = next.clips.flatMap((c) => {
    const finish = c.start + c.duration;
    if (finish <= start) return [c];
    if (c.start >= stop)
      return [{ ...c, start: Math.max(0, c.start - removed) }];
    const pieces: Clip[] = [];
    const left = start - c.start,
      right = finish - stop;
    if (left >= frame - 1e-8)
      pieces.push({ ...clone(c), duration: Math.max(frame, left) });
    if (right >= frame - 1e-8) {
      const piece = {
        ...clone(c),
        id: pieces.length ? `clip-${crypto.randomUUID()}` : c.id,
        start: Math.max(start, c.start - removed),
        in: c.in + stop - c.start,
        duration: Math.max(frame, right),
      };
      pieces.push(piece);
      for (const note of next.comments ?? []) {
        const a = note.anchor;
        if (a.type === "clip" && a.clipId === c.id && a.sourceTime >= piece.in)
          a.clipId = piece.id;
      }
    }
    return pieces;
  });
  for (const note of next.comments ?? []) {
    if (note.anchor.type === "timeline" && note.anchor.time >= start)
      note.anchor.time = Math.max(start, note.anchor.time - removed);
  }
  return validate(next);
}
export function dragClip(
  p: Project,
  c: Clip,
  mode: string,
  delta: number,
  track = c.track,
): Partial<Clip> {
  const snap = (v: number) => Math.round(v * p.fps) / p.fps;
  if (mode === "move")
    return {
      start: Math.max(0, Math.min(600 - c.duration, snap(c.start + delta))),
      track,
    };
  const source = p.assets.find((a) => a.id === c.assetId),
    limit = source?.duration ?? 600;
  if (mode === "left") {
    const d = Math.max(
      -c.start,
      source ? -c.in : -c.start,
      Math.min(c.duration - 1 / p.fps, snap(delta)),
    );
    return {
      start: c.start + d,
      in: source ? c.in + d : c.in,
      duration: c.duration - d,
    };
  }
  return {
    duration: Math.max(
      1 / p.fps,
      Math.min(600 - c.start, limit - c.in, snap(c.duration + delta)),
    ),
  };
}

export function patchLayer(
  p: Project,
  track: number,
  patch: { muted?: boolean; disabled?: boolean },
) {
  if (!Number.isInteger(track) || track < 0 || track > 7)
    throw Error("Layer must be 0–7");
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    !Object.keys(patch).length ||
    Object.keys(patch).some((key) => !["muted", "disabled"].includes(key))
  )
    throw Error("Invalid layer patch");
  p.layers = { ...p.layers, [track]: { ...p.layers?.[track], ...patch } };
  return validate(p);
}

export function chooseTake(p: Project, sectionId: string, takeId: string) {
  const section = p.takeSections?.find((s) => s.id === sectionId);
  if (!section || !section.takes.some((t) => t.id === takeId))
    throw Error("Take not found in section");
  section.preferredTakeId = takeId;
  return validate(p);
}
