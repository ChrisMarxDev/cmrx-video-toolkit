import { MatrixLoader } from "./matrix-loader";
import React, { useEffect, useState } from "react";
import type { Project } from "./model";
export function SourcePanel({
  project,
  query,
  insert,
  seek,
  disabled,
  report,
}: {
  project: Project;
  query: (id: string, start: number) => Promise<any>;
  insert: (id: string, start: number, duration: number) => Promise<unknown>;
  seek: (id: string, time: number) => void;
  disabled: boolean;
  report: (s: string) => void;
}) {
  const [id, setId] = useState(""),
    [start, setStart] = useState(0),
    [length, setLength] = useState(4),
    [data, setData] = useState<any>(null),
    [frame, setFrame] = useState(0),
    [busy, setBusy] = useState(false);
  const asset = project.assets.find((a) => a.id === id) ?? project.assets[0];
  useEffect(() => {
    let live = true;
    if (!asset) return;
    setBusy(true);
    setData(null);
    query(asset.id, start)
      .then((d) => {
        if (live) {
          setData(d);
          setFrame(0);
        }
      })
      .catch((e) => {
        if (live) report(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [asset?.id, asset?.path, asset?.transcriptRevision, start]);
  const image = (index: number, scale = 1) => ({
    width: 96 * scale,
    height: 54 * scale,
    backgroundImage: `url(${data?.sprite})`,
    backgroundSize: `${data?.columns * 96 * scale}px auto`,
    backgroundPosition: `-${(index % data?.columns) * 96 * scale}px -${Math.floor(index / data?.columns) * 54 * scale}px`,
    flexShrink: 0,
  });
  return (
    <div className="source-panel">
      <select
        aria-label="Source asset"
        value={asset?.id ?? ""}
        onChange={(e) => {
          setId(e.target.value);
          setStart(0);
        }}
      >
        {project.assets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {asset && (
        <>
          <div className="source-range">
            <label>
              From{" "}
              <input
                aria-label="Source range start"
                type="number"
                min="0"
                max={Math.max(0, asset.duration - 0.01)}
                step="0.1"
                value={start}
                onChange={(e) =>
                  setStart(
                    Math.max(
                      0,
                      Math.min(asset.duration - 0.01, Number(e.target.value)),
                    ),
                  )
                }
              />
            </label>
            <label>
              Length{" "}
              <input
                aria-label="Source insert length"
                type="number"
                min={1 / project.fps}
                max={Math.min(600, asset.duration - start)}
                step="0.1"
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
              />
            </label>
            <button
              disabled={
                disabled || length <= 0 || start + length > asset.duration
              }
              onClick={() => void insert(asset.id, start, length)}
            >
              Insert range
            </button>
          </div>
          {busy && (
            <span role="status" aria-label="Loading source">
              <MatrixLoader />
            </span>
          )}
          {data && (
            <>
              <small>
                {data.start.toFixed(2)}–{data.end.toFixed(2)}s · source
              </small>
              <svg
                className="source-levels"
                viewBox={`0 0 ${data.levels.length} 40`}
                preserveAspectRatio="none"
                aria-label="Source sound level map"
              >
                <path
                  fill="currentColor"
                  d={data.levels
                    .map(
                      (v: number, i: number) =>
                        `M${i} ${20 - v * 20}v${Math.max(1, v * 40)}h1v-${Math.max(1, v * 40)}z`,
                    )
                    .join("")}
                />
              </svg>
              <div className="source-frames">
                {data.frames.map((f: any, i: number) => (
                  <button
                    key={f.index}
                    aria-label={`Source frame ${f.sourceTime.toFixed(2)} seconds`}
                    aria-pressed={frame === i}
                    onClick={() => {
                      setFrame(i);
                      const clip = project.clips.find(
                        (c) =>
                          c.assetId === asset.id &&
                          f.sourceTime >= c.in &&
                          f.sourceTime < c.in + c.duration,
                      );
                      if (clip)
                        seek(clip.id, clip.start + f.sourceTime - clip.in);
                    }}
                  >
                    <span style={image(f.index)} />
                    <small>{f.sourceTime.toFixed(1)}s</small>
                  </button>
                ))}
              </div>
              {data.frames[frame] && data.sprite && (
                <div
                  role="img"
                  aria-label={`Source still at ${data.frames[frame].sourceTime.toFixed(2)} seconds`}
                  style={{
                    ...image(data.frames[frame].index, 2),
                    margin: "16px auto",
                  }}
                />
              )}
              <div className="source-cues">
                {data.cues.map((c: any) => (
                  <p key={c.id}>
                    <small>{c.start.toFixed(2)}s</small> {c.text}
                  </p>
                ))}
              </div>
              {data.errors.map((e: string) => (
                <small key={e}>{e}</small>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
export function ComponentControls({
  project,
  clipId,
  disabled,
  change,
}: {
  project: Project;
  clipId: string;
  disabled: boolean;
  change: (props: Record<string, unknown>) => void;
}) {
  const clip = project.clips.find((c) => c.id === clipId);
  const def = ((project.components as any[]) ?? []).find(
    (d) => d.id === clip?.componentId,
  );
  if (!def || !clip) return null;
  return (
    <details className="component-controls" open>
      <summary>{def.name ?? def.id}</summary>
      {Object.entries(def.properties).map(([name, s]: [string, any]) => {
        const value = clip.props?.[name] ?? def.defaults?.[name];
        return (
          <label key={`${clipId}:${name}`}>
            {s.label ?? name}
            {s.type === "enum" ? (
              <select
                disabled={disabled}
                value={String(value ?? "")}
                onChange={(e) => change({ [name]: e.target.value })}
              >
                {s.options.map((o: string) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                disabled={disabled}
                aria-label={s.label ?? name}
                type={
                  s.type === "boolean"
                    ? "checkbox"
                    : s.type === "number"
                      ? "number"
                      : s.type === "color"
                        ? "color"
                        : "text"
                }
                min={s.min}
                max={s.max}
                step={s.step ?? "any"}
                key={JSON.stringify(value)}
                defaultChecked={s.type === "boolean" ? !!value : undefined}
                defaultValue={
                  s.type === "boolean" ? undefined : String(value ?? "")
                }
                onChange={(e) => {
                  if (s.type === "boolean")
                    change({ [name]: e.target.checked });
                }}
                onBlur={(e) => {
                  if (s.type !== "boolean") {
                    const next =
                      s.type === "number"
                        ? Number(e.target.value)
                        : e.target.value;
                    if (next !== value) change({ [name]: next });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            )}
          </label>
        );
      })}
      <small>{def.source}</small>
    </details>
  );
}
