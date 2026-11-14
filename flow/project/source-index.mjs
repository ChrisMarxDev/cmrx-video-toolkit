// Source time is the full-resolution render input's clock, never timeline time.
export function indexTranscript(asset, cues, { reconcile = false } = {}) {
  if (!Array.isArray(cues)) throw Error("Transcript cues must be an array");
  const revision = Number(asset.transcriptRevision ?? 0) + 1;
  const used = new Set();
  const transcript = cues.map((cue, i) => {
    if (
      !Number.isFinite(cue.start) ||
      !Number.isFinite(cue.end) ||
      cue.start < 0 ||
      cue.end <= cue.start ||
      cue.end > asset.duration + 0.05 ||
      typeof cue.text !== "string"
    )
      throw Error("Invalid source cue");
    const previous = reconcile
      ? asset.transcript?.find(
          (c) =>
            !used.has(c.id) &&
            c.start === cue.start &&
            c.end === cue.end &&
            c.text === cue.text,
        )
      : null;
    const id = previous?.id ?? `${asset.id}:r${revision}:c${i}`;
    used.add(id);
    return { ...cue, id };
  });
  return {
    transcript,
    transcriptRevision: revision,
    transcriptRevisions: [
      ...(asset.transcriptRevisions ?? []),
      ...(asset.transcript
        ? [
            {
              revision: asset.transcriptRevision ?? 0,
              transcript: asset.transcript,
            },
          ]
        : []),
    ].slice(-10),
  };
}
export function sourceWindow(
  asset,
  preview,
  { start = 0, duration = 30, bins = 600 } = {},
) {
  if (
    !Number.isFinite(start) ||
    start < 0 ||
    start >= asset.duration ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 120
  )
    throw Error("Choose a source window of up to 120 seconds");
  if (!Number.isInteger(bins) || bins < 1 || bins > 1200)
    throw Error("Invalid waveform bin count");
  const end = Math.min(asset.duration, start + duration),
    origin = preview.sourceStart ?? 0;
  const count = Math.min(1200, Math.max(1, Math.floor(bins))),
    levels = [];
  const peaks = preview.peaks ?? [];
  for (let i = 0; i < count; i++) {
    const a = Math.max(
        0,
        Math.floor(
          (start + ((end - start) * i) / count - origin) * preview.peakRate,
        ),
      ),
      b = Math.min(
        peaks.length,
        Math.ceil(
          (start + ((end - start) * (i + 1)) / count - origin) *
            preview.peakRate,
        ),
      );
    let peak = 0;
    for (let j = a; j < b; j++) peak = Math.max(peak, peaks[j]);
    levels.push(peak);
  }
  const frames = Array.from({ length: preview.count ?? 0 }, (_, i) => ({
    sourceTime: origin + i * preview.interval,
    index: i,
  })).filter((f) => f.sourceTime >= start && f.sourceTime < end);
  return {
    schemaVersion: 1,
    assetId: asset.id,
    clock: "render-input",
    mediaIdentity: asset.media?.render?.sha256 ?? {
      path: asset.path,
      duration: asset.duration,
    },
    transcriptRevision: asset.transcriptRevision ?? 0,
    start,
    end,
    levels,
    frames,
    sprite: preview.sprite,
    columns: preview.columns,
    frameWidth: 96,
    frameHeight: 54,
    cues: (asset.transcript ?? [])
      .filter((c) => c.end > start && c.start < end)
      .map((c, i) => ({
        ...c,
        id: c.id ?? `${asset.id}:legacy:${c.start}:${c.end}`,
      })),
    errors: preview.errors ?? [],
  };
}
