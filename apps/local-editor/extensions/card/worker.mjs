// Trusted workspace code. Pure geometry is shared by interactive preview and export.
export function boxes(clip) {
  const color = /^#[0-9a-f]{6}$/i.test(clip.props?.color ?? "")
    ? clip.props.color
    : "#d5ff45";
  const strength = Math.max(
    0,
    Math.min(1, Number(clip.props?.strength ?? 0.65)),
  );
  return [
    { x: 0, y: 0, width: clip.width, height: clip.height, color: "#24143d" },
    {
      x: 12,
      y: 12,
      width: Math.max(2, (clip.width - 24) * strength),
      height: Math.max(2, clip.height - 24),
      color,
    },
  ];
}
export function command(project, name) {
  if (name !== "add-card") throw Error("Unknown command");
  project.clips.push({
    id: `card-${crypto.randomUUID()}`,
    name: "Signal card",
    kind: "card",
    start: 1,
    in: 0,
    duration: 3,
    track: 2,
    x: 40,
    y: 40,
    width: 240,
    height: 90,
    muted: true,
    props: { color: "#d5ff45", strength: 0.65 },
  });
  return project;
}
