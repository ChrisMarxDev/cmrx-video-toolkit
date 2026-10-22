import { clamp, range, moveInterval, clock, annotationRows } from "./model.mjs";
import { createHost } from "./agent.mjs";
import { createReviewBridge } from "../../review-agent/bridge.mjs";
const $ = (id) => document.getElementById(id);
const token = globalThis.__VIDEO_REVIEW_MCP__
  ? ""
  : new URLSearchParams(location.hash.slice(1)).get("token") ||
    sessionStorage.getItem("review-token") ||
    "";
if (!globalThis.__VIDEO_REVIEW_MCP__) {
  sessionStorage.setItem("review-token", token);
  history.replaceState(null, "", location.pathname);
}
let host;
try {
  host = await createHost(token);
} catch (failure) {
  $("error").hidden = false;
  $("error").textContent = failure.message;
  throw failure;
}
const video = $("video");
let doc = null,
  workspace = null,
  selected = null,
  draft = null,
  selection = [0, 0],
  undo = [],
  redo = [];
let picking = false, choosing = true;
let timelineZoom = 1;
let hoverPreview = null;
let hoverFrame = null;
let completing = false,
  ended = false;
let busy = false,
  dirty = false,
  saving = null,
  saveTimer = null,
  editGeneration = 0,
  dragging = false,
  textCheckpoint = false;
let lastJobError = null,
  lastExport = null;
const items = () => (doc ? [...doc.marks, ...doc.objects] : []);
const item = () => draft || items().find((v) => v.id === selected);
const error = (text) => {
  $("error").textContent = text;
  $("error").hidden = !text;
};
function element(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
async function api(path, data) {
  return host.request(path, data);
}
function snapshot() {
  return structuredClone({ marks: doc.marks, objects: doc.objects });
}
function checkpoint() {
  undo.push(snapshot());
  if (undo.length > 100) undo.shift();
  redo = [];
}
function changed() {
  editGeneration++;
  dirty = true;
  error("");
  render();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flush().catch((e) => error(e.message)), 350);
}
async function flush() {
  clearTimeout(saveTimer);
  if (saving) {
    await saving;
    if (dirty) return flush();
    return;
  }
  if (!dirty || !doc) return;
  const generation = editGeneration;
  $("save-status").textContent = "Saving…";
  saving = api("save", {
    revision: doc.revision,
    source_sha256: doc.source.sha256,
    ...snapshot(),
  })
    .then((result) => {
      doc.revision = result.revision;
      if (editGeneration === generation) dirty = false;
      $("save-status").textContent = dirty ? "Saving…" : "Saved";
    })
    .finally(() => {
      saving = null;
    });
  await saving;
  if (dirty) return flush();
}
function controls() {
  for (const node of document.querySelectorAll('#empty button, #open-form button, #open-form input'))
    node.disabled = busy || picking || ended;
  $('empty').setAttribute('aria-busy', String(busy || picking));
  document.querySelector(".action-bar").hidden = !doc || choosing;
  $("back-to-review").hidden = !doc || !choosing;
  $("undo").disabled = busy || !undo.length;
  $("redo").disabled = busy || !redo.length;
  $("play").disabled = busy || !doc;
  $("export-button").disabled = busy || !doc;
  $('zoom-out').disabled = busy || timelineZoom === 1;
  $('zoom-in').disabled = busy || timelineZoom === 32;
  if (host.session) {
    $("open-button").hidden = true;
    $("begin").hidden = !!doc || busy || ended;
    $("review-done").disabled = busy || !doc || completing || ended;
  }
}
function render() {
  if (!doc) {
    controls();
    return;
  }
  choosing = false;
  $("empty").hidden = true;
  $("editor").hidden = false;
  controls();
  $("save-status").textContent = dirty ? "Saving…" : "Saved";
  renderTimeline();
  renderTranscript();
}
function closeComment() {
  const value = item();
  const empty =
    !draft && value && value.kind === "comment" && !value.text.trim();
  if (empty) {
    checkpoint();
    doc.marks = doc.marks.filter((v) => v.id !== value.id);
  }
  draft = null;
  selected = null;
  $("comment-popover").hidden = true;
  selection = [0, 0];
  if (empty) changed();
  else if (doc) render();
}
function positionPopover() {
  if ($("comment-popover").hidden) return;
  const bar = [...document.querySelectorAll(".bar")].find(
    (b) => b.dataset.id === selected,
  );
  if (!bar) return;
  const rect = bar.getBoundingClientRect(),
    pop = $("comment-popover");
  const width = pop.offsetWidth,
    height = pop.offsetHeight;
  pop.style.left =
    clamp(
      rect.left + rect.width / 2 - width / 2,
      12,
      Math.max(12, innerWidth - width - 12),
    ) + "px";
  pop.style.top =
    clamp(rect.top - height - 14, 12, Math.max(12, innerHeight - height - 12)) +
    "px";
}
function openComment(value, focus = false) {
  if (draft && draft.id !== value.id) draft = null;
  selected = value.id;
  selection = [value.source_start, value.source_end];
  textCheckpoint = false;
  $("item-text").value = value.text;
  $("comment-popover").hidden = false;
  updatePopover();
  render();
  positionPopover();
  if (focus) $("item-text").focus({ preventScroll: true });
}
function updatePopover() {
  const value = item();
  if (!value) return;
  $("comment-time").textContent =
    `${clock(value.source_start)} – ${clock(value.source_end)}`;
  for (const [id, kind] of [
    ["positive", "good"],
    ["negative", "bad"],
  ]) {
    $(id).setAttribute("aria-pressed", String(value.kind === kind));
    $(id).disabled = busy || !!value.rect;
    $(id).title = value.rect
      ? "Existing visual direction is preserved"
      : kind === "good"
        ? "Keep"
        : "Cut";
  }
}
function createDraft(a, b) {
  closeComment();
  const [start, end] = range(a, b, doc.source.duration);
  if (end - start < 0.05) return;
  draft = {
    id: crypto.randomUUID(),
    kind: "comment",
    text: "",
    source_start: start,
    source_end: end,
  };
  openComment(draft, true);
}
function editComment(patch) {
  const value = item();
  if (!value || busy) return;
  const proposed = { ...value, ...patch };
  if (value.rect && !proposed.text.trim()) {
    error("Existing visual direction needs text. Use Delete to remove it.");
    return;
  }
  if (draft) {
    Object.assign(draft, patch);
    if (draft.kind === "comment" && !draft.text.trim()) return;
    checkpoint();
    doc.marks.push(draft);
    draft = null;
    textCheckpoint = true;
  } else {
    if (!textCheckpoint) {
      checkpoint();
      textCheckpoint = true;
    }
    Object.assign(value, patch);
  }
  updatePopover();
  changed();
}
$("item-text").oninput = () => editComment({ text: $("item-text").value });
$("item-text").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    closeComment();
  }
};
for (const [id, kind] of [
  ["positive", "good"],
  ["negative", "bad"],
])
  $(id).onclick = () => {
    const value = item();
    if (value) editComment({ kind: value.kind === kind ? "comment" : kind });
  };
$("close-comment").onclick = closeComment;
$("delete").onclick = () => {
  if (!item() || busy) return;
  if (draft) {
    closeComment();
    return;
  }
  checkpoint();
  doc.marks = doc.marks.filter((v) => v.id !== selected);
  doc.objects = doc.objects.filter((v) => v.id !== selected);
  closeComment();
  changed();
};
document.addEventListener("pointerdown", (e) => {
  if (
    !$("comment-popover").hidden &&
    !e.target.closest("#comment-popover, #timeline, .passage")
  )
    closeComment();
});
function renderTranscript() {
  if (!doc) return;
  const container = $("transcript"),
    scroll = container.scrollTop,
    search = $("search").value.toLocaleLowerCase();
  container.replaceChildren();
  const segments = doc.transcript.segments.filter((s) =>
    s.text.toLocaleLowerCase().includes(search),
  );
  if (!segments.length)
    container.append(
      element(
        "p",
        "muted",
        search ? "No matching passages." : "No speech detected.",
      ),
    );
  for (const seg of segments) {
    const button = element("button", "passage");
    button.dataset.start = seg.source_start;
    button.dataset.end = seg.source_end;
    button.append(
      element("time", "", clock(seg.source_start)),
      document.createTextNode(seg.text),
    );
    button.classList.toggle(
      "selected",
      seg.source_start < selection[1] && seg.source_end > selection[0],
    );
    for (const mark of doc.marks)
      if (
        mark.source_start < seg.source_end &&
        mark.source_end > seg.source_start
      )
        button.classList.add(
          mark.kind === "good"
            ? "kept"
            : mark.kind === "bad"
              ? "cut"
              : "commented",
        );
    button.onclick = (e) => {
      const a = e.shiftKey
          ? Math.min(selection[0], seg.source_start)
          : seg.source_start,
        b = e.shiftKey
          ? Math.max(selection[1], seg.source_end)
          : seg.source_end;
      video.currentTime = seg.source_start;
      createDraft(a, b);
    };
    container.append(button);
  }
  container.scrollTop = scroll;
  highlightPlayback();
}
function pointerDrag(event, onMove, onEnd) {
  event.preventDefault();
  event.stopPropagation();
  dragging = true;
  const pointer = event.pointerId;
  const move = (e) => {
    if (e.pointerId === pointer) onMove(e);
  };
  const end = (e) => {
    if (e.pointerId !== pointer) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    dragging = false;
    onEnd(e, e.type === "pointercancel");
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}
function placeBar(bar, value) {
  bar.style.left = (value.source_start / doc.source.duration) * 100 + "%";
  bar.style.width =
    ((value.source_end - value.source_start) / doc.source.duration) * 100 + "%";
}
function renderTimeline() {
  if (!doc || dragging) return;
  const timeline = $("timeline");
  timeline.replaceChildren();
  const all = [...items(), ...(draft ? [draft] : [])],
    rows = annotationRows(all);
  const height = Math.max(96, rows.count * 48 + 24);
  renderRuler();
  $("source-clip-name").textContent = $("source-name").textContent;
  $("source-clip-duration").textContent = clock(doc.source.duration);
  timeline.style.height = height + "px";
  $("editor").style.setProperty("--timeline-content-height", height + "px");
  if (!all.length)
    timeline.append(
      element(
        "span",
        "timeline-empty",
        "Double-click to comment · drag to select",
      ),
    );
  for (const { value, row } of rows.items) {
    const bar = element(
      "div",
      `bar ${value.kind || "comment"} ${value.id === selected ? "selected" : ""} ${value === draft ? "draft" : ""}`,
    );
    bar.dataset.id = value.id;
    bar.tabIndex = 0;
    bar.setAttribute("role", "button");
    bar.setAttribute(
      "aria-label",
      `${value.kind === "good" ? "Keep" : value.kind === "bad" ? "Cut" : "Comment"}: ${value.text || "New comment"}, ${clock(value.source_start)} to ${clock(value.source_end)}`,
    );
    bar.style.top = row * 48 + 6 + "px";
    placeBar(bar, value);
    bar.append(
      element(
        "span",
        "bar-text",
        value.text ||
          (value.kind === "good"
            ? "Keep"
            : value.kind === "bad"
              ? "Cut"
              : "Comment"),
      ),
      element("span", "edge start"),
      element("span", "edge end"),
    );
    if (value.kind === "good" || value.kind === "bad") {
      const icon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute(
        "d",
        "M7 10v11H3V10h4Zm0 0 5-8c2 0 3 2 2 5l-1 3h6a2 2 0 0 1 2 2l-2 7a3 3 0 0 1-3 2H7",
      );
      if (value.kind === "bad")
        path.setAttribute("transform", "rotate(180 12 12)");
      icon.append(path);
      bar.prepend(icon);
    }
    bar.onpointerdown = (e) => {
      if (busy || e.button !== 0) return;
      const original = structuredClone(value),
        x = e.clientX,
        bounds = timeline.getBoundingClientRect(),
        initialScroll = $('timeline-viewport').scrollLeft,
        initialTime = video.currentTime,
        edge = e.target.classList.contains("start")
          ? "start"
          : e.target.classList.contains("end")
            ? "end"
            : "move";
      let moved = false;
      video.pause();
      const before = snapshot();
      if (draft && draft.id !== value.id) draft = null;
      selected = value.id;
      $("comment-popover").hidden = true;
      for (const node of timeline.querySelectorAll(".bar"))
        node.classList.toggle("selected", node === bar);
      pointerDrag(
        e,
        (m) => {
          if (Math.abs(m.clientX - x) > 2) moved = true;
          if (!moved) return;
          Object.assign(
            value,
            moveInterval(
              original,
              ((m.clientX - x + $('timeline-viewport').scrollLeft - initialScroll) / bounds.width) * doc.source.duration,
              doc.source.duration,
              edge,
            ),
          );
          placeBar(bar, value);
          previewTime(edge === 'end' ? value.source_end : value.source_start);
        },
        (_e, cancelled) => {
          if (cancelled) {
            Object.assign(value, original);
            previewTime(initialTime);
            render();
            return;
          }
          if (moved && value !== draft) {
            undo.push(before);
            redo = [];
            changed();
          }
          previewTime(edge === 'end' ? value.source_end : value.source_start);
          openComment(value, !moved);
        },
      );
    };
    bar.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        openComment(value, true);
        return;
      }
      if (!["ArrowLeft", "ArrowRight"].includes(e.key) || busy) return;
      e.preventDefault();
      const proposed = moveInterval(
        value,
        (e.key === "ArrowLeft" ? -0.1 : 0.1) * (e.shiftKey ? 10 : 1),
        doc.source.duration,
        e.altKey ? "end" : "move",
      );
      if (value !== draft) checkpoint();
      Object.assign(value, proposed);
      video.pause();
      previewTime(e.altKey ? value.source_end : value.source_start);
      if (value !== draft) changed();
      else render();
      openComment(value);
      [...timeline.querySelectorAll(".bar")]
        .find((node) => node.dataset.id === value.id)
        ?.focus({ preventScroll: true });
    };
    timeline.append(bar);
  }
  positionPopover();
}
$("timeline").onpointerdown = (e) => {
  if (!doc || busy || e.button !== 0 || e.target.closest(".bar")) return;
  closeComment();
  const timeline = $("timeline"),
    at = (x) => {
      const bounds = timeline.getBoundingClientRect();
      return clamp((x - bounds.left) / bounds.width, 0, 1) * doc.source.duration;
    },
    initialTime = video.currentTime,
    start = at(e.clientX);
  let end = start;
  const band = element("div", "bar draft selected");
  band.style.top = "6px";
  let moved = false;
  video.pause();
  previewTime(start);
  pointerDrag(
    e,
    (m) => {
      if (!moved && Math.abs(m.clientX - e.clientX) < 4) return;
      if (!moved) {
        moved = true;
        timeline.append(band);
      }
      end = at(m.clientX);
      previewTime(end);
      const [a, b] = range(start, end, doc.source.duration);
      placeBar(band, { source_start: a, source_end: b });
    },
    (_e, cancelled) => {
      band.remove();
      if (cancelled) previewTime(initialTime);
      if (!cancelled && moved) createDraft(start, end);
      else render();
    },
  );
};
$("timeline").ondblclick = (e) => {
  if (!doc || busy || e.target.closest(".bar")) return;
  const bounds = $("timeline").getBoundingClientRect();
  const time =
    clamp((e.clientX - bounds.left) / bounds.width, 0, 1) * doc.source.duration;
  const start = Math.min(time, Math.max(0, doc.source.duration - 0.05));
  createDraft(start, Math.min(start + 2, doc.source.duration));
};
$("expand-timeline").onclick = () => {
  const expanded = $("editor").classList.toggle("timeline-expanded");
  $("expand-timeline").setAttribute("aria-expanded", String(expanded));
  $("expand-timeline").setAttribute(
    "aria-label",
    expanded ? "Collapse timeline" : "Expand timeline",
  );
  $("expand-timeline").title = expanded
    ? "Collapse timeline"
    : "Expand timeline";
  $("timeline-scroll").scrollTop = 0;
  positionPopover();
};
$("timeline-scroll").onscroll = positionPopover;
$('timeline-viewport').onscroll = positionPopover;
function setTimelineZoom(next) {
  if (!doc || dragging) return;
  const viewport = $('timeline-viewport');
  const oldBounds = $('timeline').getBoundingClientRect();
  const playheadX = oldBounds.left + video.currentTime / doc.source.duration * oldBounds.width;
  const viewBounds = viewport.getBoundingClientRect();
  const anchorX = clamp(playheadX - viewBounds.left, 0, viewport.clientWidth);
  const anchorTime = clamp((viewBounds.left + anchorX - oldBounds.left) / oldBounds.width, 0, 1);
  timelineZoom = clamp(next, 1, 32);
  viewport.style.setProperty('--timeline-zoom', timelineZoom);
  const newBounds = $('timeline').getBoundingClientRect();
  viewport.scrollLeft += newBounds.left + anchorTime * newBounds.width - viewBounds.left - anchorX;
  $('zoom-out').disabled = timelineZoom === 1;
  $('zoom-in').disabled = timelineZoom === 32;
  $('zoom-fit').textContent = timelineZoom === 1 ? 'Fit' : timelineZoom + '×';
  renderRuler();
  highlightPlayback();
  positionPopover();
}
$('zoom-in').onclick = () => setTimelineZoom(timelineZoom * 2);
$('zoom-out').onclick = () => setTimelineZoom(timelineZoom / 2);
$('zoom-fit').onclick = () => setTimelineZoom(1);
// Hover is a temporary preview, independent of saved annotations and selection.
const timelineSurface = document.querySelector('.timeline-surface');
function endHover(commit = false) {
  if (hoverFrame !== null) cancelAnimationFrame(hoverFrame);
  hoverFrame = null;
  const previous = hoverPreview;
  hoverPreview = null;
  $('timeline-origin').hidden = true;
  timelineSurface.classList.remove('hover-preview');
  if (!previous || commit) return;
  previewTime(previous.time);
  if (previous.playing) video.play().catch(e => error(e.message));
}
function timelineTime(clientX) {
  const bounds = $('timeline').getBoundingClientRect();
  return clamp((clientX - bounds.left) / bounds.width, 0, 1) * doc.source.duration;
}
timelineSurface.addEventListener('pointermove', e => {
  if (!doc || busy || dragging || e.buttons || e.pointerType === 'touch') return;
  if (!hoverPreview) {
    hoverPreview = { time: video.currentTime, playing: !video.paused };
    video.pause();
    $('timeline-origin').style.left = hoverPreview.time / doc.source.duration * 100 + '%';
    $('timeline-origin').hidden = false;
    timelineSurface.classList.add('hover-preview');
  }
  if (hoverFrame !== null) cancelAnimationFrame(hoverFrame);
  const time = timelineTime(e.clientX);
  hoverFrame = requestAnimationFrame(() => { hoverFrame = null; previewTime(time); });
});
timelineSurface.addEventListener('pointerleave', () => endHover());
timelineSurface.addEventListener('pointerdown', e => {
  if (!doc || busy || e.button !== 0) return;
  endHover(true);
  video.pause();
  previewTime(timelineTime(e.clientX));
}, true);
document.addEventListener('pointerdown', e => {
  if (!timelineSurface.contains(e.target)) endHover();
}, true);
document.addEventListener('keydown', () => endHover(), true);
window.addEventListener('blur', () => endHover());
function renderRuler() {
  if (!doc) return;
  const width = $('timeline').clientWidth;
  const target = doc.source.duration / Math.max(1, width / 90);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(target, 0.001)));
  const step = [1, 2, 5, 10].find(n => n * magnitude >= target) * magnitude;
  const ruler = $('time-ruler');
  ruler.replaceChildren();
  for (let time = 0; time <= doc.source.duration; time += step) {
    const tick = element('span', 'time-tick', clock(time).replace(/\.00$/, ''));
    tick.style.left = time / doc.source.duration * 100 + '%';
    ruler.append(tick);
  }
}
function previewTime(time) {
  video.currentTime = clamp(time, 0, doc.source.duration);
  highlightPlayback();
}
function highlightPlayback() {
  if (!doc) return;
  const t = video.currentTime;
  // Match the scrubber and playhead to the annotation axis, including its scrollbar gutter.
  document.querySelector('.timeline-surface').style.setProperty('--axis-width', $('timeline').clientWidth + 'px');
  $("position").textContent = `${clock(t)} / ${clock(doc.source.duration)}`;
  $("seek").value = t;
  $("timeline-playhead").style.left = (t / doc.source.duration) * 100 + "%";
  for (const node of $("transcript").children)
    if (node.dataset.start)
      node.classList.toggle(
        "active",
        Number(node.dataset.start) <= t && t < Number(node.dataset.end),
      );
}
video.ontimeupdate = highlightPlayback;
const playSvg = $("play").innerHTML;
function playbackIcon() {
  const paused = video.paused;
  $("play").innerHTML = paused
    ? playSvg
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>';
  $("play").setAttribute(
    "aria-label",
    paused ? "Play (Space)" : "Pause (Space)",
  );
  $("play").title = paused ? "Play (Space)" : "Pause (Space)";
}
video.onplay = playbackIcon;
video.onpause = playbackIcon;
video.onerror = () =>
  error("Could not play the prepared video. Try preparing it again.");
$("play").onclick = () => {
  if (!doc) return;
  video.paused ? video.play().catch((e) => error(e.message)) : video.pause();
};
$("seek").oninput = () => {
  video.currentTime = Number($("seek").value);
  highlightPlayback();
};
$("search").oninput = renderTranscript;
$("undo").onclick = () => {
  if (!undo.length || busy) return;
  redo.push(snapshot());
  Object.assign(doc, undo.pop());
  selected = null;
  draft = null;
  closeComment();
  changed();
};
$("redo").onclick = () => {
  if (!redo.length || busy) return;
  undo.push(snapshot());
  Object.assign(doc, redo.pop());
  selected = null;
  draft = null;
  closeComment();
  changed();
};
window.addEventListener("keydown", (e) => {
  if (completing || ended || picking) return;
  if (e.key === "Escape") {
    closeComment();
    return;
  }
  if (
    !doc ||
    busy ||
    document.querySelector("dialog[open]") ||
    ["INPUT", "TEXTAREA"].includes(e.target.tagName)
  )
    return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    $(e.shiftKey ? "redo" : "undo").click();
  } else if (e.code === "Space") {
    e.preventDefault();
    $("play").click();
  }
});
window.addEventListener("beforeunload", (e) => {
  if (dirty || saving) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("resize", () => {
  if (!dragging) renderTimeline();
  highlightPlayback();
  positionPopover();
});
async function loadLibrary() {
  try {
    const { videos } = await api('videos');
    $('video-list').replaceChildren();
    $('library-status').textContent = videos.length ? '' : 'No videos yet. Choose a recording to get started.';
    $('library-status').hidden = !!videos.length;
    for (const entry of videos) {
      const row = element('button', 'video-entry');
      row.append(element('span', 'video-entry-name', entry.name));
      row.append(element('span', 'video-entry-detail',
        [entry.filename, entry.duration == null ? null : clock(entry.duration),
          entry.prepared ? 'Resume review' : 'Prepare video'].filter(Boolean).join(' · ')));
      row.title = entry.location;
      row.onclick = () => openVideo(() => api('select', { id: entry.id }));
      $('video-list').append(row);
    }
    controls();
  } catch (failure) {
    $('library-status').hidden = false;
    $('library-status').textContent = 'Could not load videos. Refresh to try again, or choose a new recording.';
    error(failure.message);
  }
}
async function openVideo(operation) {
  if (busy || picking || ended) return;
  picking = true;
  controls();
  video.pause();
  $('job').hidden = false;
  $('job-text').textContent = 'Opening video…';
  $('cancel').hidden = true;
  error('');
  try {
    await flush();
    await operation();
    $('open-dialog').close();
  } catch (failure) {
    error(failure.message);
  } finally {
    picking = false;
    await poll().catch(failure => error(failure.message));
    controls();
  }
}
async function uploadAndOpen(file) {
  if (!file) return;
  await openVideo(async () => {
    $('job-text').textContent = 'Copying video…';
    const selected = await host.upload(file);
    await api('open', selected);
  });
}
$('begin').onclick = () => $('library-file').click();
$('library-file').onchange = async () => {
  await uploadAndOpen($('library-file').files[0]);
  $('library-file').value = '';
};
$('refresh-videos').onclick = loadLibrary;
$('back-to-review').onclick = render;
$('open-path').onclick = () => $('open-dialog').showModal();
$('open-button').onclick = async () => {
  try { await flush(); } catch (failure) { error(failure.message); return; }
  choosing = true;
  video.pause();
  $('editor').hidden = true;
  $('empty').hidden = false;
  document.querySelector('.action-bar').hidden = true;
  await loadLibrary();
};
$('close-open').onclick = () => $('open-dialog').close();
// Selecting a file always begins preparation; there is no second submit click.
$('video-file').onchange = async () => {
  await uploadAndOpen($('video-file').files[0]);
  $('video-file').value = '';
};
$('open-form').onsubmit = async e => {
  e.preventDefault();
  const path = $('path').value.trim();
  if (!path) return error('Choose a video or enter its local path.');
  await openVideo(() => api('open', {
    path, workspace: $('workspace-path').value.trim() || undefined,
    model: $('model-path').value.trim() || undefined,
    transcript: $('transcript-path').value.trim() || undefined,
    source: $('relink-path').value.trim() || undefined,
  }));
};
if (host.expand) {
  $('expand-app').hidden = false;
  $('expand-app').onclick = () => host.expand().catch(failure => error(failure.message));
}
$("retry").onclick = () =>
  api("retry", {})
    .then(poll)
    .catch((e) => error(e.message));
$("cancel").onclick = () => api("cancel", {}).catch((e) => error(e.message));
$("export-button").onclick = () => $("export-dialog").showModal();
$("close-export").onclick = () => $("export-dialog").close();
$("export-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await flush();
    await api("export", { render: $("render-cut").checked });
    $("export-dialog").close();
    error("");
    await poll();
  } catch (e) {
    error(e.message);
  }
};
async function poll() {
  if (completing || ended || picking) return;
  const state = await api("state");
  if (completing || ended || picking) return;
  const wasBusy = busy;
  busy = state.job.busy;
  $("retry").hidden = busy || !state.job.error || !state.last_open;
  $("job").hidden = !busy && !state.job.error;
  $("job-text").textContent = state.job.message;
  $("cancel").hidden = !busy;
  $("open-button").disabled = busy;
  $("begin").disabled = busy;
  $("export-button").disabled = busy || !doc;
  for (const node of document.querySelectorAll(
    "#editor button,#editor input,#editor textarea",
  ))
    node.disabled = busy;
  if (state.job.error && state.job.error !== lastJobError) {
    error(state.job.error);
    lastJobError = state.job.error;
  }
  if (!state.job.error) lastJobError = null;
  if (state.job.export && state.job.export !== lastExport) {
    lastExport = state.job.export;
    $("export-result").textContent = `Handoff saved to ${lastExport}`;
    $("export-result").hidden = false;
  }
  if (state.document && workspace !== state.workspace && doc && dirty) {
    error(
      "Another tab opened a different video. Copy your unsaved instructions before reloading this tab.",
    );
    return;
  }
  if (state.document && (workspace !== state.workspace || !doc)) {
    $("export-result").hidden = true;
    lastExport = state.job.export || null;
    doc = state.document;
    workspace = state.workspace;
    $("source-name").textContent = doc.source.path.split(/[\\/]/).pop();
    selected = null;
    undo = [];
    redo = [];
    dirty = false;
    selection = [0, 0];
    video.src = host.mediaUrl(doc.source.sha256);
    $("seek").max = doc.source.duration;
    setTimelineZoom(1);
    $('timeline-viewport').scrollLeft = 0;
    $("path").value = workspace + "/review.json";
    $("workspace-path").value = "";
    draft = null;
    $("comment-popover").hidden = true;
    render();
  } else if (wasBusy !== busy && doc) render();
  $("undo").disabled = busy || !undo.length;
  $("redo").disabled = busy || !redo.length;
  controls();
  if (item()) updatePopover();
  if (host.session) {
    const status = await api("session");
    if (["completed", "cancelled"].includes(status.status)) endReview(status);
  }
}
function lockReview(value) {
  for (const selector of ["#editor", ".action-bar", "#comment-popover"])
    document.querySelector(selector).inert = value;
}
function endReview(result) {
  ended = true;
  video.pause();
  lockReview(true);
  $("export-result").hidden = false;
  $("export-result").textContent =
    result.status === "completed"
      ? "Review saved. You can return to your agent."
      : "Review cancelled. Your saved draft is preserved.";
}
if (host.session) {
  const done = element("button", "", "Done");
  done.id = "review-done";
  done.title = "Save review and return to your agent";
  document.querySelector(".action-bar").append(done);
  const bridge = createReviewBridge({
    request: host.request,
    flush,
    getIdentity: () => ({
      sessionId: host.session.sessionId,
      revision: doc.revision,
      sourceSha256: doc.source.sha256,
    }),
    notify: host.notify,
  });
  done.onclick = async () => {
    if (busy || !doc || completing || ended) return;
    closeComment();
    completing = true;
    lockReview(true);
    video.pause();
    try {
      const result = await bridge.done();
      endReview(result);
      if (result.continuation === "unavailable")
        $("export-result").textContent =
          "Review saved. Ask your agent to read session " +
          result.sessionId +
          ".";
    } catch (failure) {
      lockReview(false);
      error(failure.message);
    } finally {
      completing = false;
    }
  };
}
let connectionFailures = 0;
async function loop() {
  try {
    await poll();
    connectionFailures = 0;
  } catch (e) {
    connectionFailures++;
    error("Review connection interrupted. Saved changes are preserved; retrying locally. " + e.message);
  }
  if (!ended) setTimeout(loop, Math.min(15000, 800 * 2 ** Math.min(connectionFailures, 5)));
}
loadLibrary();
loop();
