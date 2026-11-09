import React, { useState } from "react";
import type { Project } from "./model";
export function TakeSelector({
  project,
  disabled,
  preview,
  choose,
  stop,
}: {
  project: Project;
  disabled: boolean;
  stop: () => void;
  preview: (start: number, end: number, clipId: string) => void;
  choose: (sectionId: string, takeId: string) => Promise<boolean | undefined>;
}) {
  const [sectionId, setSectionId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const sections = project.takeSections ?? [];
  const section = sections.find((s) => s.id === sectionId) ?? sections[0];
  if (!section) return null;
  const take =
    section.takes.find(
      (t) => t.id === (drafts[section.id] ?? section.preferredTakeId),
    ) ?? section.takes[0];
  const index = section.takes.indexOf(take);
  const locate = (id: string) => {
    const t = section.takes.find((t) => t.id === id)!;
    const c = project.clips.find(
      (c) =>
        c.kind === "video" &&
        c.assetId === section.assetId &&
        !project.layers?.[c.track]?.disabled &&
        c.in <= t.sourceStart + 0.001 &&
        c.in + c.duration >= t.sourceEnd - 0.001,
    );
    return c
      ? {
          start: c.start + t.sourceStart - c.in,
          end: c.start + t.sourceEnd - c.in,
          clipId: c.id,
        }
      : null;
  };
  const audition = (id: string) => {
    setDrafts({ ...drafts, [section.id]: id });
    const range = locate(id);
    if (range) preview(range.start, range.end, range.clipId);
  };
  const available = locate(take.id);
  return (
    <div className="take-selector" aria-label="Section take comparison">
      <select
        aria-label="Take section"
        title="Compare alternatives within this section"
        value={section.id}
        onChange={(e) => {
          stop();
          setSectionId(e.target.value);
        }}
      >
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
            {s.preferredTakeId ? " ✓" : ""}
          </option>
        ))}
      </select>
      <button
        aria-label="Previous take"
        title="Previous take"
        disabled={index === 0}
        onClick={() => audition(section.takes[index - 1].id)}
      >
        ‹
      </button>
      <select
        aria-label="Take alternative"
        title="Choose an alternative to preview at its own length"
        value={take.id}
        onChange={(e) => audition(e.target.value)}
      >
        {section.takes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label} · {(t.sourceEnd - t.sourceStart).toFixed(1)}s
            {section.preferredTakeId === t.id ? " ✓" : ""}
          </option>
        ))}
      </select>
      <button
        aria-label="Next take"
        title="Next take"
        disabled={index === section.takes.length - 1}
        onClick={() => audition(section.takes[index + 1].id)}
      >
        ›
      </button>
      <button
        aria-label="Replay take"
        title={
          available
            ? "Replay just this take"
            : "This full take is not present on an enabled timeline layer"
        }
        disabled={!available}
        onClick={() => audition(take.id)}
      >
        ↻
      </button>
      <button
        aria-label="Keep take for section"
        aria-pressed={section.preferredTakeId === take.id}
        title="Save preference for this section; keep all alternatives"
        disabled={disabled || section.preferredTakeId === take.id}
        onClick={() => choose(section.id, take.id)}
      >
        ✓
      </button>
    </div>
  );
}
