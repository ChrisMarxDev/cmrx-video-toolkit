import {
  canonicalize,
  seconds,
  fromSeconds,
  timelineAt,
  sourceAt,
} from "./time.mjs";
export function resolveAnchor(project, anchor) {
  try {
    const r = resolveAnchorUnsafe(project, anchor);
    return r.status === "resolved" && (!Number.isFinite(r.time) || r.time < 0)
      ? { status: "hidden", reason: "outside-timeline" }
      : r;
  } catch {
    return { status: "hidden", reason: "invalid-anchor" };
  }
}
function resolveAnchorUnsafe(project, anchor) {
  if (!anchor) return { status: "fixed" };
  if (
    (anchor.type === "source" && !anchor.assetId) ||
    (anchor.type === "clip" && !anchor.clipId)
  )
    return { status: "hidden", reason: "invalid-anchor" };
  if (anchor.type === "timeline")
    return {
      status: "resolved",
      time:
        typeof anchor.time === "number" ? anchor.time : seconds(anchor.time),
    };
  const asset = project.assets.find(
    (a) => a.id === anchor.assetId || a.id === anchor.sourceAssetId,
  );
  if ((anchor.assetId || anchor.sourceAssetId) && !asset)
    return { status: "hidden", reason: "missing-asset" };
  let source = anchor.sourceTime;
  if (anchor.type === "semantic") {
    if (!asset) return { status: "hidden", reason: "missing-asset" };
    const cue = asset.transcript?.find(
      (c) =>
        (c.id ?? `${asset.id}:legacy:${c.start}:${c.end}`) ===
        (anchor.cueId ?? anchor.wordId),
    );
    if (!cue) return { status: "hidden", reason: "missing-cue" };
    if (
      anchor.transcriptRevision !== undefined &&
      anchor.transcriptRevision !== asset.transcriptRevision
    )
      return { status: "hidden", reason: "stale-transcript" };
    source = cue.start;
  }
  if (!["clip", "semantic", "source"].includes(anchor.type))
    return { status: "hidden", reason: "unsupported-anchor" };
  if (typeof source === "object") source = seconds(source);
  const candidates = project.clips.filter(
    (c) =>
      c.kind === "video" &&
      (!anchor.clipId || c.id === anchor.clipId) &&
      (!asset || c.assetId === asset.id) &&
      source >= c.in &&
      source < c.in + c.duration,
  );
  if (candidates.length !== 1)
    return {
      status: "hidden",
      reason: candidates.length
        ? "ambiguous-occurrence"
        : "trimmed-or-missing-occurrence",
    };
  const clip = candidates[0],
    offset =
      typeof anchor.offset === "object"
        ? seconds(anchor.offset)
        : (anchor.offset ?? 0);
  const at = seconds(timelineAt(clip, fromSeconds(source))) + offset;
  if (!Number.isFinite(at) || at < 0)
    return { status: "hidden", reason: "outside-timeline" };
  return { status: "resolved", time: at, clipId: clip.id, sourceTime: source };
}
export function resolveProject(document) {
  const project = canonicalize(document),
    warnings = [];
  if (project.clips.some((c) => c.kind === "graphics"))
    project.graphicsMode = "instances";
  const definitions = new Map((project.components ?? []).map((d) => [d.id, d]));
  for (const clip of project.clips) {
    if (clip.kind === "graphics" && clip.componentId) {
      const def = definitions.get(clip.componentId);
      if (!def) {
        warnings.push({ clipId: clip.id, code: "missing-component" });
        clip.resolvedHidden = true;
        continue;
      }
      clip.props = {
        ...(def.defaults ?? {}),
        ...clip.props,
        source: def.source,
      };
    }
    if (clip.anchor) {
      const result = resolveAnchor(project, clip.anchor);
      clip.anchorResolution = result;
      if (result.status === "hidden") {
        clip.resolvedHidden = true;
        warnings.push({ clipId: clip.id, code: result.reason });
      } else if (result.status === "resolved") {
        clip.start = result.time;
        clip.timing.start = fromSeconds(result.time);
      }
    }
  }
  project.clips = project.clips.filter((c) => !c.resolvedHidden);
  return {
    schemaVersion: 1,
    project,
    warnings,
    duration: Math.max(1, ...project.clips.map((c) => c.start + c.duration)),
    capabilities: {
      interactive: project.previewMode !== "rendered",
      reason:
        project.previewMode === "rendered" ? "rendered-toolkit-output" : null,
    },
  };
}
export function resolvePosition(project, { clipId, sourceTime, timelineTime }) {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) throw Error("Clip not found");
  return timelineTime !== undefined
    ? {
        clipId,
        sourceTime: sourceAt(
          clip,
          typeof timelineTime === "number"
            ? fromSeconds(timelineTime)
            : timelineTime,
        ),
      }
    : {
        clipId,
        timelineTime: timelineAt(
          clip,
          typeof sourceTime === "number" ? fromSeconds(sourceTime) : sourceTime,
        ),
      };
}
