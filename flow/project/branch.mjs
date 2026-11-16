const randomUUID = () => globalThis.crypto.randomUUID();
import { canonicalize } from "./time.mjs";
import { resolveProject, resolveAnchor } from "./resolve.mjs";
// Derive cuts without changing media bytes or the source project. No UI dependency.
export function branchProject(source, spec) {
  if (
    typeof spec.name !== "string" ||
    !spec.name.trim() ||
    spec.name.length > 100 ||
    /[\\/\x00-\x1f]/.test(spec.name) ||
    spec.name.startsWith(".") ||
    spec.name.trim() !== spec.name
  )
    throw Error("Use a non-hidden project name without slashes");
  if (
    typeof spec.brief !== "string" ||
    !spec.brief.trim() ||
    spec.brief.length > 20000
  )
    throw Error("Each project needs a brief");
  for (const k of ["script", "instructions", "memory"])
    if (
      spec[k] !== undefined &&
      (typeof spec[k] !== "string" || spec[k].length > 100000)
    )
      throw Error("Invalid project context: " + k);
  const ranges = spec.ranges ?? [];
  if (!Array.isArray(ranges) || ranges.length > 100)
    throw Error("Invalid project ranges");
  for (const r of ranges)
    if (
      r.assetId !== undefined &&
      (typeof r.assetId !== "string" || !r.assetId)
    )
      throw Error("Invalid source asset ID");
  if (source.previewMode === "rendered" && ranges.some((r) => !r.assetId))
    throw Error(
      "Rendered output has no interactive timeline; use recording source ranges or a blank project with inherited code/context",
    );
  const modes = new Set(ranges.map((r) => (r.assetId ? "source" : "timeline")));
  if (modes.size > 1)
    throw Error(
      "Use either source ranges or timeline ranges within one project",
    );
  const resolved = resolveProject(source),
    p = structuredClone(source),
    warnings = [],
    comments = [];
  p.name = spec.name;
  p.revision = 0;
  p.clips = [];
  p.comments = [];
  delete p.previewMode;
  delete p.renderedOutput;
  delete p.takeSections;
  if (modes.has("source")) p.layers = {};
  if (
    modes.has("source") ||
    !ranges.length ||
    source.clips.some((c) => c.kind === "graphics") ||
    source.graphicsMode === "instances"
  )
    p.graphicsMode = "instances";
  const nearFrame = (n) =>
    Math.abs(n - Math.round(n * source.fps) / source.fps) < 1e-10
      ? Math.round(n * source.fps) / source.fps
      : n;
  const usedIds = new Set();
  const childId = (id) => {
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
    const next = "clip-" + randomUUID();
    usedIds.add(next);
    return next;
  };
  let cursor = 0;
  for (const r of ranges) {
    if (
      !Number.isFinite(r.start) ||
      !Number.isFinite(r.end) ||
      r.start < 0 ||
      r.end <= r.start
    )
      throw Error("Choose a positive range");
    const duration = nearFrame(r.end - r.start),
      mapping = new Map();
    let sourceClip;
    if (r.assetId) {
      const a = p.assets.find((a) => a.id === r.assetId);
      if (!a || r.end > a.duration + 1e-8)
        throw Error("Source range exceeds its recording");
      const media = a.media?.render,
        fit = media
          ? Math.min(p.width / media.width, p.height / media.height)
          : 1,
        width = media ? media.width * fit : p.width,
        height = media ? media.height * fit : p.height;
      sourceClip = {
        id: "clip-" + randomUUID(),
        name: a.name,
        kind: "video",
        assetId: a.id,
        start: cursor,
        in: r.start,
        duration,
        track: 0,
        x: (p.width - width) / 2,
        y: (p.height - height) / 2,
        width,
        height,
        muted: false,
      };
      p.clips.push(sourceClip);
    } else {
      if (r.end > resolved.duration + 1e-8)
        throw Error("Timeline range exceeds the project");
      const pieces = [];
      for (const c of resolved.project.clips) {
        const start = Math.max(r.start, c.start),
          end = Math.min(r.end, c.start + c.duration);
        if (end - start < 1 / source.fps - 1e-8) continue;
        const n = {
          ...structuredClone(c),
          id: childId(c.id),
          start: cursor + start - r.start,
          in: c.in + start - c.start,
          duration: nearFrame(end - start),
        };
        delete n.timing;
        delete n.anchorResolution;
        mapping.set(c.id, n.id);
        pieces.push(n);
      }
      p.clips.push(...pieces);
      for (const c of pieces) {
        if (!c.anchor) continue;
        if (c.anchor.clipId)
          c.anchor.clipId = mapping.get(c.anchor.clipId) ?? c.anchor.clipId;
        const result = resolveAnchor(p, c.anchor);
        if (
          result.status !== "resolved" ||
          Math.abs(result.time - c.start) > 1e-8
        ) {
          c.parentAnchor = c.anchor;
          delete c.anchor;
          warnings.push(
            `${c.name}: source anchor materialized at the selected cut; parent definition retained.`,
          );
        }
      }
    }
    for (const note of source.comments ?? []) {
      const a = note.anchor;
      let anchor;
      if (
        a.type === "timeline" &&
        !r.assetId &&
        a.time >= r.start &&
        a.time < r.end
      )
        anchor = { ...a, time: cursor + a.time - r.start };
      if (a.type === "clip") {
        const old = source.clips.find((c) => c.id === a.clipId),
          assetId = a.sourceAssetId ?? old?.assetId;
        const target =
          sourceClip?.assetId === assetId
            ? sourceClip
            : p.clips.find((c) => mapping.get(a.clipId) === c.id);
        if (
          target &&
          a.sourceTime >= target.in &&
          a.sourceTime < target.in + target.duration
        )
          anchor = {
            ...a,
            clipId: target.id,
            ...(assetId ? { sourceAssetId: assetId } : {}),
          };
      }
      if (anchor)
        comments.push({
          ...structuredClone(note),
          id: "comment-" + randomUUID(),
          createdRevision: 0,
          anchor,
        });
    }
    cursor += duration;
  }
  p.comments = comments;
  p.branch = {
    schemaVersion: 1,
    parentName: source.name,
    parentRevision: source.revision,
    ranges: structuredClone(ranges),
  };
  return {
    project: canonicalize(p),
    warnings: [
      ...resolved.warnings.map((w) => `Parent ${w.clipId}: ${w.code}`),
      ...warnings,
    ],
  };
}
