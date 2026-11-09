import { dragClip, type Clip, type Project } from "./model";

export const LANE_HEIGHT = 64;
export const clipWidth = (clip: Clip, zoom: number) =>
  Math.max(24, clip.duration * zoom);

// Display-only interval packing. Rows are not authored tracks or render layers.
export function layoutTimeline(clips: Clip[], zoom: number) {
  return Array.from(
    { length: Math.max(0, ...clips.map((c) => c.track)) + 1 },
    (_, track) => {
      const ends: number[] = [];
      const items = clips
        .filter((c) => c.track === track)
        .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
        .map((clip) => {
          const start = clip.start * zoom;
          let lane = ends.findIndex((end) => end <= start);
          if (lane < 0) lane = ends.length;
          ends[lane] = start + clipWidth(clip, zoom);
          return { clip, lane };
        });
      return { track, items, laneCount: Math.max(1, ends.length) };
    },
  ).reverse();
}

export type TrackBounds = { track: number; top: number; bottom: number };
export function trackAtPointer(
  bounds: TrackBounds[],
  y: number,
  fallback: number,
) {
  const hit = bounds.find((row) => y >= row.top && y < row.bottom);
  if (hit) return hit.track;
  const first = bounds[0];
  const last = bounds.at(-1);
  if (first && y < first.top)
    return Math.min(7, first.track + Math.ceil((first.top - y) / LANE_HEIGHT));
  if (last && y >= last.bottom) return 0;
  return fallback;
}

// Snap authored edges, not the minimum display width of a short clip.
export function snapClipDrag(
  p: Project,
  clip: Clip,
  mode: string,
  delta: number,
  track: number,
  zoom: number,
  playhead: number,
  enabled: boolean,
) {
  let patch = dragClip(p, clip, mode, delta, track);
  if (!enabled) return { patch, guide: null as number | null };
  const moved = { ...clip, ...patch };
  const edges =
    mode === "move"
      ? [moved.start, moved.start + moved.duration]
      : mode === "left"
        ? [moved.start]
        : [moved.start + moved.duration];
  const targets = [
    0,
    playhead,
    ...p.clips
      .filter((c) => c.id !== clip.id)
      .flatMap((c) => [c.start, c.start + c.duration]),
  ];
  let distance = 8 / zoom,
    guide: number | null = null,
    adjustment = 0;
  for (const edge of edges)
    for (const target of targets) {
      const difference = target - edge;
      if (Math.abs(difference) < distance) {
        distance = Math.abs(difference);
        adjustment = difference;
        guide = target;
      }
    }
  if (guide !== null) {
    const effectiveDelta =
      mode === "right"
        ? moved.duration - clip.duration
        : moved.start - clip.start;
    patch = dragClip(p, clip, mode, effectiveDelta + adjustment, track);
    const result = { ...clip, ...patch };
    const actual =
      mode === "move"
        ? [result.start, result.start + result.duration]
        : mode === "left"
          ? [result.start]
          : [result.start + result.duration];
    if (!actual.some((edge) => Math.abs(edge - guide!) < 0.001)) guide = null;
  }
  return { patch, guide };
}
