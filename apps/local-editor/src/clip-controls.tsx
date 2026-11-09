import React, { useEffect, useState } from "react";
import { dragClip, type Clip, type Project } from "./model";
function TimeField({
  label,
  value,
  fps,
  disabled,
  commit,
}: {
  label: string;
  value: number;
  fps: number;
  disabled: boolean;
  commit: (value: number) => void;
}) {
  const [text, setText] = useState(value.toFixed(3));
  useEffect(() => setText(value.toFixed(3)), [value]);
  const save = () => {
    const next = Number(text);
    setText(value.toFixed(3));
    if (text.trim() && Number.isFinite(next) && Math.abs(next - value) > 0.0006)
      commit(next);
  };
  return (
    <input
      aria-label={label}
      title={`${label} · seconds · Enter to apply · Escape to cancel`}
      type="number"
      step={1 / fps}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setText(value.toFixed(3));
        }
      }}
    />
  );
}
export function ClipControls({
  project,
  clip,
  time,
  disabled,
  update,
}: {
  project: Project;
  clip?: Clip;
  time: number;
  disabled: boolean;
  update: (patch: Partial<Clip>) => void;
}) {
  if (!clip) return <div className="clip-controls" />;
  const cut = time > clip.start && time < clip.start + clip.duration;
  const icon = (path: string) => (
    <svg
      viewBox="0 0 24 24"
      className="icon"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
  return (
    <div className="clip-controls" aria-label="Selected clip controls">
      <span className="selected-name" title={clip.name}>
        {clip.name}
      </span>
      <label title="Timeline position (seconds)">
        {icon("M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4")}
        <TimeField
          key={`${clip.id}-start`}
          label="Clip position"
          value={clip.start}
          fps={project.fps}
          disabled={disabled}
          commit={(value) =>
            update(dragClip(project, clip, "move", value - clip.start))
          }
        />
      </label>
      <label title="Duration (seconds)">
        {icon("M4 6v12M20 6v12M4 12h16")}
        <TimeField
          key={`${clip.id}-duration`}
          label="Clip duration"
          value={clip.duration}
          fps={project.fps}
          disabled={disabled}
          commit={(value) =>
            update(dragClip(project, clip, "right", value - clip.duration))
          }
        />
      </label>
      <label title="Layer">
        {icon("m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5")}
        <select
          aria-label="Clip layer"
          disabled={disabled}
          value={clip.track}
          onChange={(e) => update({ track: Number(e.target.value) })}
        >
          {Array.from({ length: 8 }, (_, n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button
        aria-label="Trim start to playhead"
        title="Trim start to playhead (Q)"
        disabled={disabled || !cut}
        onClick={() =>
          update(dragClip(project, clip, "left", time - clip.start))
        }
      >
        {icon("M5 4v16M9 7h10v10H9M12 9l-3 3 3 3")}
      </button>
      <button
        aria-label="Trim end to playhead"
        title="Trim end to playhead (W)"
        disabled={disabled || !cut}
        onClick={() =>
          update(
            dragClip(project, clip, "right", time - clip.start - clip.duration),
          )
        }
      >
        {icon("M19 4v16M15 7H5v10h10M12 9l3 3-3 3")}
      </button>
    </div>
  );
}
