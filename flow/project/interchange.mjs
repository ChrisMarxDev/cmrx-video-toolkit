import { resolveProject } from "./resolve.mjs";
const rational = (s, fps) => ({
  OTIO_SCHEMA: "RationalTime.1",
  value: s * fps,
  rate: fps,
});
const range = (start, duration, fps) => ({
  OTIO_SCHEMA: "TimeRange.1",
  start_time: rational(start, fps),
  duration: rational(duration, fps),
});
export function exportOTIO(document, { mediaPrefix = "" } = {}) {
  const { project, warnings: anchors } = resolveProject(document),
    warnings = anchors.map((a) => `${a.clipId}: ${a.code}`),
    tracks = [];
  if (project.components?.length)
    warnings.push(
      "Dynamic Flutter sources/props are preserved in native metadata, not editable OTIO effects.",
    );
  for (const track of [...new Set(project.clips.map((c) => c.track))].sort(
    (a, b) => a - b,
  )) {
    const clips = project.clips
        .filter((c) => c.track === track)
        .sort((a, b) => a.start - b.start),
      children = [];
    let cursor = 0;
    for (const c of clips) {
      if (c.kind !== "video") {
        warnings.push(
          `${c.id}: programmable content requires a baked render; retained in native project only.`,
        );
        continue;
      }
      if (c.start < cursor - 1e-8) {
        warnings.push(
          `${c.id}: overlapping positioned clip exported to a separate OTIO track.`,
        );
        tracks.push({
          OTIO_SCHEMA: "Track.1",
          name: c.name,
          kind: "Video",
          children: [
            ...(c.start ? [gap(c.start, project.fps)] : []),
            item(c, project, mediaPrefix),
          ],
        });
        continue;
      }
      if (c.start > cursor) children.push(gap(c.start - cursor, project.fps));
      children.push(item(c, project, mediaPrefix));
      cursor = c.start + c.duration;
    }
    tracks.push({
      OTIO_SCHEMA: "Track.1",
      name: `Layer ${track}`,
      kind: "Video",
      children,
    });
  }
  if (
    project.clips.some(
      (c) =>
        c.x ||
        c.y ||
        c.width !== project.width ||
        c.height !== project.height ||
        c.muted ||
        c.volume !== undefined,
    ) ||
    Object.keys(project.layers ?? {}).length
  )
    warnings.push(
      "Canvas transforms, mute/gain and layer visibility are native-only; bake an export for visual/audio parity.",
    );
  return {
    timeline: {
      OTIO_SCHEMA: "Timeline.1",
      name: project.name,
      global_start_time: rational(0, project.fps),
      tracks: { OTIO_SCHEMA: "Stack.1", name: "Tracks", children: tracks },
      metadata: {
        cmrx: {
          schemaVersion: 1,
          project: structuredClone(document),
          warnings,
        },
      },
    },
    warnings,
  };
}
const gap = (duration, fps) => ({
  OTIO_SCHEMA: "Gap.1",
  source_range: range(0, duration, fps),
});
function item(c, p, prefix = "") {
  const a = p.assets.find((a) => a.id === c.assetId);
  if (!a) throw Error("Missing interchange media");
  return {
    OTIO_SCHEMA: "Clip.1",
    name: c.name,
    source_range: range(c.in, c.duration, p.fps),
    media_reference: {
      OTIO_SCHEMA: "ExternalReference.1",
      target_url: prefix + a.path,
      available_range: range(0, a.duration, p.fps),
    },
    metadata: {
      cmrx: { clipId: c.id, assetId: a.id, representation: "render-input" },
    },
  };
}
export function inspectOTIO(timeline) {
  if (timeline?.OTIO_SCHEMA !== "Timeline.1")
    throw Error("Not an OTIO Timeline");
  const clips = [];
  for (const [track, t] of (timeline.tracks?.children ?? []).entries()) {
    let start = 0;
    for (const item of t.children ?? []) {
      const r = item.source_range;
      if (!r || !Number.isFinite(r.duration?.value) || !(r.duration?.rate > 0))
        throw Error("Unsupported OTIO timing");
      const duration = r.duration.value / r.duration.rate;
      if (duration < 0) throw Error("Negative OTIO duration");
      if (item.OTIO_SCHEMA === "Clip.2" || item.OTIO_SCHEMA === "Clip.1")
        clips.push({
          track,
          id: item.metadata?.cmrx?.clipId,
          name: item.name,
          path: item.media_reference?.target_url,
          start,
          in: r.start_time.value / r.start_time.rate,
          duration,
        });
      else if (item.OTIO_SCHEMA !== "Gap.1")
        throw Error("Unsupported OTIO item; preserve native project");
      start += duration;
    }
  }
  return {
    clips,
    nativeProject: timeline.metadata?.cmrx?.project ?? null,
    warnings: timeline.metadata?.cmrx?.warnings ?? [],
  };
}
