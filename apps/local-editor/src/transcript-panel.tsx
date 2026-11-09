import React, { useRef, useState } from "react";
import type { Project } from "./model";
import { parseTranscript, timelineTranscript } from "./transcript";
const stamp = (time: number) =>
  `${Math.floor(time / 60)
    .toString()
    .padStart(2, "0")}:${(time % 60).toFixed(2).padStart(5, "0")}`;
export function TranscriptPanel({
  project,
  selectedAsset,
  time,
  disabled,
  importCues,
  seek,
  report,
}: {
  project: Project;
  selectedAsset?: string;
  time: number;
  disabled: boolean;
  importCues: (
    assetId: string,
    transcript: ReturnType<typeof parseTranscript>,
  ) => Promise<boolean | undefined>;
  seek: (clipId: string, time: number) => void;
  report: (message: string) => void;
}) {
  const [assetChoice, setAssetChoice] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const assetId = project.assets.some((a) => a.id === assetChoice)
    ? assetChoice
    : (selectedAsset ?? project.assets[0]?.id);
  const cues = timelineTranscript(project);
  return (
    <div className="transcript-panel">
      <div className="transcript-tools">
        <select
          aria-label="Transcript source"
          value={assetId ?? ""}
          onChange={(e) => setAssetChoice(e.target.value)}
        >
          {project.assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          aria-label="Import transcript"
          title="Import SRT, VTT or JSON for this source"
          disabled={disabled || !assetId}
          onClick={() => file.current?.click()}
        >
          <svg
            className="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />
          </svg>
        </button>
        <input
          ref={file}
          type="file"
          hidden
          accept=".srt,.vtt,.json"
          aria-label="Transcript file"
          onChange={async (e) => {
            const upload = e.target.files?.[0];
            e.target.value = "";
            if (!upload || !assetId) return;
            const target = assetId;
            try {
              if (upload.size > 1000000)
                throw Error("Transcript must be smaller than 1 MB");
              const transcript = parseTranscript(await upload.text());
              if (
                project.assets.find((a) => a.id === target)?.transcript
                  ?.length &&
                !window.confirm("Replace this source’s transcript?")
              )
                return;
              await importCues(target, transcript);
            } catch (error) {
              report((error as Error).message);
            }
          }}
        />
      </div>
      {!cues.length ? (
        <div className="transcript-empty">
          <p>No transcript yet</p>
          <span>Import timed text for a source. It follows your cuts.</span>
          <small>SRT · VTT · JSON</small>
        </div>
      ) : (
        <div className="transcript-list">
          {cues.map((cue) => (
            <button
              key={cue.key}
              className="transcript-cue"
              data-active={time >= cue.start && time < cue.end}
              onClick={() => seek(cue.clipId, cue.start)}
              title={cue.clipName}
            >
              <time>{stamp(cue.start)}</time>
              <span>{cue.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
