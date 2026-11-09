import type { Project, TranscriptSegment } from "./model";

// Import source-time cues, never guessed word timestamps or timeline coordinates.
export function parseTranscript(text: string): TranscriptSegment[] {
  const raw = text.replace(/^\uFEFF/, "").trim();
  if (raw.startsWith("[") || raw.startsWith("{")) {
    const json = JSON.parse(raw);
    const cues = Array.isArray(json) ? json : json.segments;
    if (!Array.isArray(cues))
      throw Error("JSON must contain an array of segments");
    return cues;
  }
  const clock = (value: string) => {
    const match = /^(?:(\d{2,}):)?(\d{2}):(\d{2})[,.](\d{3})$/.exec(value);
    if (!match || +match[2] > 59 || +match[3] > 59)
      throw Error("Invalid subtitle timestamp");
    return (
      +(match[1] || 0) * 3600 + +match[2] * 60 + +match[3] + +match[4] / 1000
    );
  };
  const blocks = raw
    .replace(/\r/g, "")
    .replace(/^WEBVTT[^\n]*(?:\n|$)/, "")
    .trim()
    .split(/\n\s*\n/);
  return blocks.filter(Boolean).map((block) => {
    const lines = block.split("\n");
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0) throw Error("Expected timed SRT/VTT cues");
    const match = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[timing]);
    if (!match) throw Error("Invalid subtitle cue");
    return {
      start: clock(match[1]),
      end: clock(match[2]),
      text: lines.slice(timing + 1).join("\n"),
    };
  });
}

export function timelineTranscript(p: Project) {
  return p.clips
    .flatMap((clip) => {
      if (clip.kind !== "video") return [];
      const asset = p.assets.find((a) => a.id === clip.assetId);
      return (asset?.transcript ?? []).flatMap((cue, index) => {
        const from = Math.max(cue.start, clip.in),
          to = Math.min(cue.end, clip.in + clip.duration);
        return to > from
          ? [
              {
                key: `${clip.id}:${index}`,
                clipId: clip.id,
                clipName: clip.name,
                start: clip.start + from - clip.in,
                end: clip.start + to - clip.in,
                text: cue.text,
              },
            ]
          : [];
      });
    })
    .sort((a, b) => a.start - b.start || a.clipId.localeCompare(b.clipId));
}
