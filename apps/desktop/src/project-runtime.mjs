import { jobProjection } from "../../local-editor/dist/render-contract.mjs";
// A pure projection of independent lifecycles, not another mutable authority.
// Legacy flags remain wire-compatible; callers share named capability reasons.
export function timelineOwner(s) {
  if (s.recoveryRequired) return "recovery";
  if (s.switching) return "provider-switch";
  if (s.importing) return "import";
  if (s.steering) return "steering";
  if (s.busy) return "agent";
  if (s.preparingRender || s.blockingRender) return "export";
  return null;
}
const terminalFailure = new Set([
  "failed",
  "canceled",
  "cancelled",
  "interrupted",
]);
export function renderStage(job) {
  if (!job) return "idle";
  return jobProjection(job).phase;
}
export function projectRuntime(s) {
  const jobs = s.jobs || [];
  const active = jobs.find((j) => j.status === "running");
  const owner = timelineOwner({
    ...s,
    blockingRender: jobs.some(
      (j) => j.status === "running" && j.kind !== "overlay",
    ),
  });
  const previewJob = jobs
    .filter((j) => j.kind === "overlay" || j.overlay)
    .at(-1);
  const preview = s.recoveryRequired
    ? { phase: "recovery", kind: "project", reason: "interrupted-checkpoint" }
    : active
      ? {
          phase: renderStage(active),
          kind: active.kind === "overlay" ? "graphics" : "export",
          jobId: active.id,
          track: active.track ?? null,
          trackCount: active.trackCount ?? null,
        }
      : s.sourceError
        ? { phase: "failed", kind: "graphics", reason: "source-error" }
        : previewJob && terminalFailure.has(previewJob.status)
          ? { phase: previewJob.status, kind: "graphics", jobId: previewJob.id }
          : { phase: s.overlay?.stale ? "stale" : "ready", kind: "graphics" };
  const capability = (allowed, reason = null) => ({
    allowed,
    reason: allowed ? null : reason,
  });
  const connected = !!s.connected;
  const queuePhase = !s.queue?.length
    ? "empty"
    : s.queuePaused
      ? "paused"
      : !connected
        ? "disconnected"
        : owner || active
          ? "waiting"
          : "ready";
  let label;
  if (owner === "recovery") label = "Project recovery needed";
  else if (owner === "provider-switch") label = "Switching provider…";
  else if (owner === "import") label = s.activity || "Choosing a video…";
  else if (owner === "steering") label = "Delivering queued message…";
  else if (owner === "agent")
    label = s.approvals?.length
      ? "Waiting for your approval"
      : "Agent editing…";
  else if (active) {
    const noun =
      active.kind === "overlay" ? "graphics preview" : "video export";
    const phase = renderStage(active);
    label =
      phase === "waiting"
        ? `Waiting to render ${noun}…`
        : phase === "canceling"
          ? `Canceling ${noun}…`
          : phase === "verifying"
            ? `Checking ${noun}…`
            : phase === "preparing"
              ? `Preparing ${noun}…`
              : `Rendering ${noun}${active.track != null ? ` · layer ${active.track + 1}/${active.trackCount}` : ""}…`;
  } else if (owner === "export") label = "Preparing video export…";
  else if (s.sourceError || (previewJob && preview.phase === "failed"))
    label = "Graphics preview failed";
  else if (preview.phase === "interrupted")
    label = "Graphics preview interrupted";
  else if (["canceled", "cancelled"].includes(preview.phase))
    label = "Graphics preview canceled";
  else if (preview.phase === "stale") label = "Graphics preview needs updating";
  else label = "Ready to edit";
  return {
    schemaVersion: 1,
    renderJobs: jobs.map(jobProjection),
    connection: {
      phase: s.connected
        ? "connected"
        : s.providers?.find((p) => p.id === s.provider)?.preparing
          ? "preparing"
          : s.providers?.find((p) => p.id === s.provider)?.authenticating
            ? "signing-in"
            : "disconnected",
    },
    owner,
    agent: {
      phase: s.steering
        ? "steering"
        : s.busy
          ? s.approvals?.length
            ? "awaiting-approval"
            : "working"
          : "idle",
    },
    preview,
    queue: {
      phase: queuePhase,
      count: s.queue?.length || 0,
      paused: !!s.queuePaused,
    },
    capabilities: {
      editTimeline: capability(!owner, owner),
      interactiveTimeline: capability(
        !owner && !s.rendered,
        owner || (s.rendered ? "rendered-toolkit-output" : null),
      ),
      seek: capability(true),
      previewLayers: capability(true),
      send: capability(
        connected && !s.switching,
        !connected ? "disconnected" : "provider-switch",
      ),
      steerQueued: capability(
        connected && !!s.busy && !!s.canSteer && !s.steering && !s.switching,
        !connected
          ? "disconnected"
          : !s.canSteer
            ? "provider-unsupported"
            : s.steering
              ? "steering"
              : s.switching
                ? "provider-switch"
                : "no-active-task",
      ),
      export: capability(!owner && !active, owner || "renderer"),
    },
    label,
  };
}
