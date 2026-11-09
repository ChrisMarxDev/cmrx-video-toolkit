// Keep sent snapshots separate from the editable project comments.
export const commentKey = (c) =>
  JSON.stringify([c.id, c.body, c.anchor, c.reopenedRevision ?? 0]);
export function pendingComments(project, messages) {
  const sent = new Map();
  for (const m of messages)
    if (m.role === "user")
      for (const c of m.comments || []) sent.set(c.id, commentKey(c));
  return (project.comments || []).filter(
    (c) => c.status === "open" && sent.get(c.id) !== commentKey(c),
  );
}
export function commentStamp(c) {
  const value =
    c.anchor.type === "timeline" ? c.anchor.time : c.anchor.sourceTime;
  const minutes = Math.floor(value / 60);
  const seconds = (value % 60).toFixed(2).padStart(5, "0");
  return `${String(minutes).padStart(2, "0")}:${seconds}`;
}
export function renderComments(
  comments,
  doc = document,
  onOpen = () => {},
  positions = {},
) {
  const root = doc.createElement("div");
  root.className = "comment-payload";
  root.setAttribute("aria-label", "Attached timed comments");
  for (const c of comments) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "comment-attachment comment-stamp";
    const time = positions[c.id];
    button.textContent =
      typeof time === "number"
        ? commentStamp({ anchor: { type: "timeline", time } })
        : commentStamp(c);
    button.title = `${c.anchor.type === "clip" ? "Source " : ""}${commentStamp(c)} · ${c.body}`;
    button.setAttribute(
      "aria-label",
      `Open comment at ${button.textContent}: ${c.body}`,
    );
    button.onclick = () => onOpen(c);
    root.append(button);
  }
  return root;
}
