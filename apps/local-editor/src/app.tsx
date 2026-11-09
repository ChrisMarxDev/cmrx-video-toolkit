import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  end,
  dragClip,
  locateComment,
  type CommentAnchor,
  type Project,
  type Clip,
  type Box,
} from "./model";
import {
  layoutTimeline,
  snapClipDrag,
  trackAtPointer,
  clipWidth,
  LANE_HEIGHT,
  type TrackBounds,
} from "./timeline";
import "./style.css";
import { ClipControls } from "./clip-controls";
import { DockLayout } from "./dock-layout";
import { TranscriptPanel } from "./transcript-panel";
import { TakeSelector } from "./take-selector";
import { ClipMedia } from "./clip-media";
type State = {
  selection?: { clipId?: string; time?: number };
  project: Project;
  error: string;
  canUndo: boolean;
  canRedo: boolean;
  boxes: Record<string, Box[]>;
  extensions: {
    id: string;
    kind: string;
    name: string;
    browser?: string;
    commands: { id: string; label: string }[];
  }[];
};
const embedded = location.pathname === "/embed";
const hash = new URLSearchParams(location.hash.slice(1));
let token = hash.get("token") || "";
try {
  if (token) sessionStorage.setItem("editor-token", token);
  else token = sessionStorage.getItem("editor-token") || "";
  if (hash.has("token"))
    history.replaceState(null, "", location.pathname + location.search);
} catch {
  // Opaque-origin MCP sandboxes forbid storage/history; retain the capability in memory.
}
const resource = (route: string, args: Record<string, string> = {}) =>
  `/api/${route}?${new URLSearchParams({ ...args, token })}`;
async function api(route: string, body?: unknown) {
  const r = await fetch(embedded ? resource(route) : `/api/${route}`, {
    method: body ? "POST" : "GET",
    headers: embedded
      ? { "Content-Type": "text/plain" }
      : {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
    credentials: "omit",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
}
const seconds = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`;
function VideoLayer({
  clip,
  time,
  playing,
  playbackRate,
  report,
}: {
  clip: Clip;
  time: number;
  playing: boolean;
  playbackRate: number;
  report: (s: string) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const active = time >= clip.start && time < clip.start + clip.duration;
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.playbackRate = playbackRate;
    v.preservesPitch = true;
    const target = Math.max(0, clip.in + time - clip.start);
    if (active) {
      if (!playing || Math.abs(v.currentTime - target) > 0.18)
        v.currentTime = target;
      if (playing && v.paused)
        v.play().catch(() =>
          report(
            "Playback was blocked or the asset cannot decode. Press Play again, or inspect an FFmpeg render.",
          ),
        );
      else if (!playing) v.pause();
    } else v.pause();
  }, [time, playing, playbackRate, active, clip.in, clip.start]);
  return (
    <video
      ref={ref}
      src={resource("media", { id: clip.assetId! })}
      muted={clip.muted}
      playsInline
      preload="auto"
      onError={() =>
        report(
          `Cannot decode ${clip.name}; use a browser-compatible MP4 proxy.`,
        )
      }
      style={{
        display: active ? "block" : "none",
        left: clip.x,
        top: clip.y,
        width: clip.width,
        height: clip.height,
        objectFit: "fill",
      }}
    />
  );
}
type PreviewBridge = {
  locked: boolean;
  overlay: null | {
    url: string;
    duration: number;
    id: string;
    thumbnails?: boolean;
  };
};
function GraphicsLayer({
  overlay,
  time,
  playing,
  playbackRate,
}: {
  overlay: NonNullable<PreviewBridge["overlay"]>;
  time: number;
  playing: boolean;
  playbackRate: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const sync = () => {
      v.playbackRate = playbackRate;
      if (!playing || Math.abs(v.currentTime - time) > 0.12)
        v.currentTime = Math.min(time, Math.max(0, v.duration - 1 / 60));
      if (playing && time < overlay.duration) v.play().catch(() => {});
      else v.pause();
    };
    if (v.readyState && Number.isFinite(v.duration)) sync();
    else v.addEventListener("loadedmetadata", sync, { once: true });
    return () => v.removeEventListener("loadedmetadata", sync);
  }, [overlay.url, time, playing, playbackRate]);
  return (
    <video
      aria-label="Flutter graphics layer"
      data-overlay={overlay.id}
      ref={ref}
      src={overlay.url}
      muted
      playsInline
      preload="auto"
      style={{
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        display: time < overlay.duration ? "block" : "none",
      }}
    />
  );
}
type IconName =
  | "play"
  | "pause"
  | "comment"
  | "edit"
  | "transcript"
  | "volume"
  | "mute"
  | "eye"
  | "eye-off"
  | "split"
  | "remove"
  | "undo"
  | "redo"
  | "zoom"
  | "send"
  | "check"
  | "reopen"
  | "keyboard"
  | "close";
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    play: <path d="m8 5 11 7-11 7z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    edit: <path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z" />,
    comment: <path d="M20 4H4v13h5l3 4 3-4h5zM8 8h8M8 12h5" />,
    volume: (
      <path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14" />
    ),
    mute: <path d="M3 9h4l5-4v14l-5-4H3zM16 9l6 6M16 15l6-6" />,
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    "eye-off": (
      <path d="m3 3 18 18M9 5a13 13 0 0 1 13 7s-1 3-4 5M6 6a18 18 0 0 0-4 6s4 7 10 7c2 0 3-1 4-1M10 10a3 3 0 0 0 4 4" />
    ),
    transcript: <path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5" />,
    split: (
      <>
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="m9 8 11 11M9 16 20 5" />
      </>
    ),
    remove: <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />,
    undo: <path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7v3" />,
    redo: <path d="m16 4 5 5-5 5M21 9H11a7 7 0 0 0-7 7v3" />,
    zoom: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    send: <path d="m3 3 18 9-18 9 3-9zM6 12h15" />,
    check: <path d="m4 12 5 5L20 6" />,
    reopen: <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />,
    keyboard: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M6 9h1m3 0h1m3 0h1m3 0h1M6 13h1m3 0h1m3 0h1m3 0h1M7 16h10" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
const shortcuts = [
  ["Space", "Play / pause"],
  ["← / →", "Previous / next frame"],
  ["Shift + ← / →", "Step 10 frames"],
  ["Alt + ← / →", "Nudge selected clip 1 frame"],
  ["Alt + Shift + ← / →", "Nudge 10 frames"],
  ["Home / End", "Timeline start / end"],
  ["S", "Split at playhead"],
  ["Q / W", "Trim start / end to playhead"],
  ["Shift while dragging", "Snap to clip edges and playhead"],
  ["← / → on trim handle", "Trim 1 frame (Shift: 10)"],
  ["Delete / Backspace", "Remove selected clip"],
  ["M", "Comment at playhead"],
  ["Shift + M", "Mute selected clip’s layer"],
  ["Shift + V", "Disable selected clip’s layer"],
  ["C", "Toggle comments"],
  ["T", "Toggle transcript"],
  ["Alt + ← / → on pane header", "Move pane"],
  ["Enter", "Post / save comment"],
  ["Shift + Enter", "New line in comment"],
  ["Ctrl/⌘ + Z", "Undo"],
  ["Ctrl/⌘ + Shift + Z", "Redo"],
  ["Ctrl + Y", "Redo"],
  ["− / +", "Timeline zoom"],
  ["F", "Fit full timeline"],
  ["Scroll / trackpad", "Pan the timeline"],
  ["Hold Space + drag / middle drag", "Hand tool"],
  ["Pinch / Ctrl/⌘ + scroll", "Zoom at pointer"],
  ["?", "Keyboard shortcuts"],
  ["Esc", "Cancel clip drag / close shortcuts"],
];
function App() {
  const [previewBridge, setPreviewBridge] = useState<PreviewBridge | null>(
    null,
  );
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (
        window.parent !== window &&
        e.source === window.parent &&
        e.origin === location.origin &&
        e.data?.type === "cmrx-pause"
      ) {
        setPlaying(false);
        return;
      }
      if (
        window.parent === window ||
        e.source !== window.parent ||
        e.origin !== location.origin ||
        e.data?.type !== "cmrx:preview"
      )
        return;
      const overlay = e.data.overlay;
      if (overlay) {
        try {
          const url = new URL(overlay.url, location.origin);
          if (
            url.origin !== location.origin ||
            url.pathname !== "/chat/overlay"
          )
            return;
        } catch {
          return;
        }
      }
      setPreviewBridge((previous) =>
        JSON.stringify(previous) ===
        JSON.stringify({ overlay, locked: !!e.data.locked })
          ? previous
          : { overlay, locked: !!e.data.locked },
      );
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  const [state, setState] = useState<State | null>(null),
    [connected, setConnected] = useState(false),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState("opening"),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [playbackRate, setPlaybackRate] = useState(1),
    [zoom, setZoom] = useState(80),
    [timelineWidth, setTimelineWidth] = useState(1000),
    [fitView, setFitView] = useState(
      () => new URLSearchParams(location.search).get("fit") === "1",
    ),
    [snapGuide, setSnapGuide] = useState<number | null>(null),
    [pending, setPending] = useState(false),
    [showComments, setShowComments] = useState(true),
    [showTranscript, setShowTranscript] = useState(false),
    [showShortcuts, setShowShortcuts] = useState(false),
    [timelineFraction, setTimelineFraction] = useState(0.38),
    [commentBody, setCommentBody] = useState(""),
    [editingComment, setEditingComment] = useState<{
      id: string;
      body: string;
      original: string;
    } | null>(null),
    [commentTarget, setCommentTarget] = useState<CommentAnchor | null>(null);
  const timelineScroll = useRef<HTMLDivElement>(null);
  const [handReady, setHandReady] = useState(false),
    [panning, setPanning] = useState(false);
  const spaceGesture = useRef({ held: false, used: false });
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    id: number;
  } | null>(null);
  const finishPan = () => {
    const viewport = timelineScroll.current;
    if (pan.current && viewport?.hasPointerCapture(pan.current.id))
      viewport.releasePointerCapture(pan.current.id);
    pan.current = null;
    setPanning(false);
  };
  const zoomAnchor = useRef<{ time: number; x: number } | null>(null);
  const scrub = useRef(false);
  const takeRange = useRef<{ start: number; end: number } | null>(null);
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const dividerDrag = useRef<{ y: number; fraction: number } | null>(null);
  const [draft, setDraft] = useState<{
    id: string;
    patch: Partial<Clip>;
  } | null>(null);
  const stateRef = useRef(state);
  const restoredView = useRef(false);
  stateRef.current = state;
  const drag = useRef<{
      clip: Clip;
      x: number;
      y: number;
      mode: string;
      revision: number;
      bounds: TrackBounds[];
      scrollTop: number;
      scrollLeft: number;
      patch: Partial<Clip>;
    } | null>(null),
    stage = useRef<HTMLDivElement>(null),
    [scale, setScale] = useState(1);
  useEffect(() => {
    if (!token) {
      setNotice(
        "Open the full URL printed by npm start. Its token connects this tab to your workspace.",
      );
      return;
    }
    const events = new EventSource(resource("events"));
    events.onmessage = (e) => {
      const next = JSON.parse(e.data) as State;
      if (!restoredView.current) {
        restoredView.current = true;
        if (Number.isFinite(next.selection?.time))
          setTime(
            Math.min(end(next.project), Math.max(0, next.selection!.time!)),
          );
        if (next.selection?.clipId) setSelected(next.selection.clipId);
      }
      setState(next);
      setConnected(true);
    };
    events.onerror = () => {
      setConnected(false);
      setPlaying(false);
    };
    return () => events.close();
  }, []);
  const p = state?.project;
  useEffect(() => {
    if (p && !p.clips.some((clip) => clip.id === selected))
      setSelected(p.clips[0]?.id || "");
  }, [p, selected]);
  useEffect(() => {
    const openComment = (event: MessageEvent) => {
      if (
        window.parent === window ||
        event.source !== window.parent ||
        event.origin !== location.origin ||
        event.data?.type !== "cmrx:open-comment"
      )
        return;
      const comment = p?.comments?.find((c) => c.id === event.data.id);
      if (!comment || !p) {
        setNotice("This comment is no longer in the project.");
        return;
      }
      const position = locateComment(p, comment);
      setPlaying(false);
      setShowComments(true);
      if (position.time !== null) {
        setTime(position.time);
        if (comment.anchor.type === "clip") setSelected(comment.anchor.clipId);
      } else
        setNotice("This comment’s moment is no longer in the current cut.");
      requestAnimationFrame(() => {
        const card = Array.from(
          document.querySelectorAll<HTMLElement>("[data-comment]"),
        ).find((el) => el.dataset.comment === comment.id);
        card?.scrollIntoView({ block: "nearest" });
        card?.focus({ preventScroll: true });
      });
    };
    window.addEventListener("message", openComment);
    return () => window.removeEventListener("message", openComment);
  }, [p]);
  useEffect(() => {
    if (window.parent !== window && p)
      window.parent.postMessage(
        {
          type: "cmrx:comment-positions",
          positions: Object.fromEntries(
            (p.comments || []).map((c) => [c.id, locateComment(p, c).time]),
          ),
        },
        location.origin,
      );
  }, [p]);
  const duration = p ? end(p) : 1;
  const paddingTime = Math.min(3, duration * 0.05);
  const fitZoom = Math.min(
    160,
    Math.max(0.01, (timelineWidth - 132) / (duration + paddingTime)),
  );
  const minZoom = Math.min(40, fitZoom);
  const rulerStep =
    [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(
      (step) => step * zoom >= 55,
    ) ?? 600;
  const fitTimeline = () => {
    zoomAnchor.current = null;
    setFitView(true);
    setZoom(fitZoom);
    if (timelineScroll.current) timelineScroll.current.scrollLeft = 0;
  };
  useEffect(() => {
    const viewport = timelineScroll.current;
    if (!viewport) return;
    const observer = new ResizeObserver((entries) =>
      setTimelineWidth(entries[0].contentRect.width),
    );
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [!!p]);
  useEffect(() => {
    if (p && end(p) > 30) setFitView(true);
  }, [!!p]);
  useEffect(() => {
    if (fitView) {
      setZoom(fitZoom);
      if (timelineScroll.current) timelineScroll.current.scrollLeft = 0;
    } else setZoom((v) => Math.max(minZoom, v));
  }, [fitZoom, fitView, minZoom]);
  useEffect(() => {
    const viewport = timelineScroll.current;
    if (!viewport) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (drag.current || scrub.current || pan.current) return;
      if (!e.ctrlKey && !e.metaKey) {
        const unit =
          e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.clientWidth : 1;
        if (e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX))
          viewport.scrollTop += e.deltaY * unit;
        else
          viewport.scrollLeft +=
            (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) *
            unit;
        return;
      }
      const x = e.clientX - viewport.getBoundingClientRect().left;
      const delta =
        e.deltaY *
        (e.deltaMode === 1
          ? 16
          : e.deltaMode === 2
            ? viewport.clientHeight
            : 1);
      const nextZoom = Math.max(
        minZoom,
        Math.min(160, zoom * Math.exp(-delta * 0.01)),
      );
      if (nextZoom === zoom) return;
      zoomAnchor.current = { time: (viewport.scrollLeft + x - 100) / zoom, x };
      setFitView(false);
      setZoom(nextZoom);
    };
    viewport.addEventListener("wheel", wheel, { passive: false });
    return () => viewport.removeEventListener("wheel", wheel);
  }, [!!p, zoom, minZoom]);
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    if (anchor && timelineScroll.current) {
      timelineScroll.current.scrollLeft = anchor.time * zoom + 100 - anchor.x;
      zoomAnchor.current = null;
    }
  }, [zoom]);
  useEffect(() => {
    setTime((t) => Math.min(t, duration));
  }, [duration]);
  useEffect(() => {
    if (!stage.current || !p) return;
    const observer = new ResizeObserver((entries) =>
      setScale(entries[0].contentRect.width / p.width),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [!!p, p?.width]);
  useEffect(() => {
    if (!playing) return;
    let handle: number;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.max(0, (now - last) / 1000);
      last = now;
      setTime((t) => {
        const next = t + delta * playbackRate;
        const stop = takeRange.current?.end ?? duration;
        if (next >= stop) {
          takeRange.current = null;
          setPlaying(false);
          return stop;
        }
        return next;
      });
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, duration, playbackRate]);
  useEffect(() => {
    if (!connected) return;
    const h = setTimeout(
      () => api("selection", { clipId: selected, time }).catch(() => {}),
      250,
    );
    return () => clearTimeout(h);
  }, [selected, time, connected]);
  async function mutate(
    route: string,
    data: object = {},
    revision = p?.revision,
  ) {
    if (!connected || pending || previewBridge?.locked) return;
    setPlaying(false);
    setNotice("");
    setPending(true);
    try {
      await api(route, { ...data, revision });
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.code !== "Space" ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        !connected ||
        e.isComposing ||
        target.isContentEditable ||
        target.closest("input,textarea,select")
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!spaceGesture.current.held) {
        spaceGesture.current = { held: true, used: false };
        setHandReady(true);
      }
    };
    const clear = () => {
      spaceGesture.current = { held: false, used: false };
      setHandReady(false);
      finishPan();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !spaceGesture.current.held) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!spaceGesture.current.used) {
        takeRange.current = null;
        setTime((t) => (t >= duration ? 0 : t));
        setPlaying((v) => !v);
      }
      clear();
    };
    document.addEventListener("keydown", down, true);
    document.addEventListener("keyup", up, true);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("keydown", down, true);
      document.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", clear);
    };
  }, [connected, duration]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "Escape" && drag.current) {
        e.preventDefault();
        drag.current = null;
        setDraft(null);
        setSnapGuide(null);
        return;
      }
      if (
        target.closest(".handle") &&
        ["ArrowLeft", "ArrowRight"].includes(e.key)
      )
        return;
      if (
        target.closest(".dock-title") &&
        e.altKey &&
        ["ArrowLeft", "ArrowRight"].includes(e.key)
      )
        return;
      if (e.key === "Escape" && showShortcuts) {
        e.preventDefault();
        setShowShortcuts(false);
        return;
      }
      if (
        !connected ||
        e.isComposing ||
        target.isContentEditable ||
        target.closest('textarea, select, a, input:not([type="range"])') ||
        (target.closest('input[type="range"], [role="separator"]') &&
          [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Home",
            "End",
          ].includes(e.key))
      )
        return;
      if (
        previewBridge?.locked &&
        (e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          ["s", "q", "w", "Delete", "Backspace"].includes(e.key))
      )
        return;
      const key = e.key.toLowerCase();
      const command = e.ctrlKey || e.metaKey;
      const c = p?.clips.find((c) => c.id === selected);
      // A shortcut can disable its focused toolbar button (e.g. Split). Keep
      // focus on the editing surface so the following Undo still receives keys.
      if (
        target.closest("button") &&
        ((command && (key === "z" || key === "y")) ||
          (!command && ["s", "delete", "backspace"].includes(key)))
      ) {
        document
          .querySelector<HTMLElement>(`[data-clip="${selected}"]`)
          ?.focus();
      }
      if (command) {
        if (key === "z" || (key === "y" && !e.metaKey)) {
          e.preventDefault();
          if (!disabled && !e.repeat) {
            const redo = key === "y" || e.shiftKey;
            if (redo ? state?.canRedo : state?.canUndo)
              void mutate(redo ? "redo" : "undo");
          }
        }
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) {
          takeRange.current = null;
          if (time >= duration) setTime(0);
          setPlaying((v) => !v);
        }
      } else if (key === "arrowleft" || key === "arrowright") {
        e.preventDefault();
        const frames = (key === "arrowleft" ? -1 : 1) * (e.shiftKey ? 10 : 1);
        setPlaying(false);
        if (e.altKey) {
          if (!disabled && !e.repeat && c && p)
            void mutate("clip", {
              id: c.id,
              patch: {
                start: Math.max(
                  0,
                  Math.min(
                    600 - c.duration,
                    Math.round(c.start * p.fps + frames) / p.fps,
                  ),
                ),
              },
            });
        } else if (p)
          setTime((t) =>
            Math.max(
              0,
              Math.min(duration, Math.round(t * p.fps + frames) / p.fps),
            ),
          );
      } else if (e.altKey) return;
      else if (key === "home" || key === "end") {
        e.preventDefault();
        setPlaying(false);
        setTime(key === "home" ? 0 : duration);
      } else if (key === "?" && !e.repeat) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      } else if (key === "c" && !e.repeat) {
        e.preventDefault();
        setShowComments((v) => !v);
      } else if (
        (key === "q" || key === "w") &&
        !disabled &&
        !e.repeat &&
        c &&
        p &&
        time > c.start &&
        time < c.start + c.duration
      ) {
        e.preventDefault();
        void mutate("clip", {
          id: c.id,
          patch: dragClip(
            p,
            c,
            key === "q" ? "left" : "right",
            key === "q" ? time - c.start : time - c.start - c.duration,
          ),
        });
      } else if (key === "t" && !e.repeat) {
        e.preventDefault();
        setShowTranscript((v) => !v);
      } else if (
        e.shiftKey &&
        ["m", "v"].includes(key) &&
        c &&
        p &&
        !disabled &&
        !e.repeat
      ) {
        e.preventDefault();
        const flag = key === "m" ? "muted" : "disabled";
        void mutate("layer", {
          track: c.track,
          patch: { [flag]: !p.layers?.[c.track]?.[flag] },
        });
      } else if (key === "m" && !disabled && !e.repeat) {
        e.preventDefault();
        beginComment();
      } else if (
        key === "s" &&
        !disabled &&
        !e.repeat &&
        c &&
        time > c.start &&
        time < c.start + c.duration
      ) {
        e.preventDefault();
        void mutate("split", { id: c.id, time });
      } else if (
        (key === "delete" || key === "backspace") &&
        !disabled &&
        !e.repeat &&
        c
      ) {
        e.preventDefault();
        void mutate("delete", { id: c.id });
      } else if (key === "f" && !e.repeat) {
        e.preventDefault();
        fitTimeline();
      } else if (key === "+" || key === "=" || key === "-") {
        e.preventDefault();
        setFitView(false);
        setZoom((v) =>
          Math.max(
            minZoom,
            Math.min(
              160,
              v < 40
                ? v * (key === "-" ? 0.8 : 1.25)
                : v + (key === "-" ? -10 : 10),
            ),
          ),
        );
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  });
  const begin = (e: React.PointerEvent, clip: Clip, mode: string) => {
    if (!connected || pending || previewBridge?.locked || e.button !== 0)
      return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget
      .closest<HTMLElement>("[data-clip]")
      ?.focus({ preventScroll: true });
    setSelected(clip.id);
    setPlaying(false);
    // Capture on the stable canvas: packing can reorder/reparent clip nodes.
    (e.currentTarget as HTMLElement)
      .closest<HTMLElement>(".timeline")!
      .setPointerCapture(e.pointerId);
    drag.current = {
      clip: { ...clip },
      x: e.clientX,
      y: e.clientY,
      mode,
      revision: p!.revision,
      bounds: Array.from(
        document.querySelectorAll<HTMLElement>(".track[data-track]"),
      ).map((row) => ({
        track: Number(row.dataset.track),
        top: row.getBoundingClientRect().top,
        bottom: row.getBoundingClientRect().bottom,
      })),
      scrollTop: document.querySelector(".timeline-scroll")?.scrollTop ?? 0,
      scrollLeft: timelineScroll.current?.scrollLeft ?? 0,
      patch: {},
    };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !p) return;
    // Freeze track boundaries for this gesture: adding/removing display rows
    // must not accidentally turn a horizontal move into a layer change.
    const scrollDelta =
      (document.querySelector(".timeline-scroll")?.scrollTop ?? 0) -
      d.scrollTop;
    const track =
      d.mode === "move"
        ? trackAtPointer(d.bounds, e.clientY + scrollDelta, d.clip.track)
        : d.clip.track;
    if (
      Math.abs(e.clientX - d.x) < 3 &&
      Math.abs(e.clientY - d.y) < 3 &&
      !Object.keys(d.patch).length
    )
      return;
    const scrollX = (timelineScroll.current?.scrollLeft ?? 0) - d.scrollLeft;
    const result = snapClipDrag(
      p,
      d.clip,
      d.mode,
      (e.clientX - d.x + scrollX) / zoom,
      track,
      zoom,
      time,
      e.shiftKey,
    );
    d.patch = result.patch;
    setSnapGuide(result.guide);
    setDraft({ id: d.clip.id, patch: d.patch });
  };
  const finish = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDraft(null);
    setSnapGuide(null);
    if (Object.entries(d.patch).some(([key, value]) => d.clip[key] !== value))
      void mutate("clip", { id: d.clip.id, patch: d.patch }, d.revision);
  };
  const seek = (clientX: number, ruler: HTMLElement) => {
    takeRange.current = null;
    setPlaying(false);
    const t = (clientX - ruler.getBoundingClientRect().left) / zoom;
    setTime(Math.max(0, Math.min(duration, Math.round(t * p!.fps) / p!.fps)));
  };
  const disabled =
    !connected || pending || !!state?.error || !!previewBridge?.locked;
  if (!state)
    return (
      <main className="loading">
        <h1>CMRX Workspace</h1>
        <p>{notice || "Connecting to your local workspace…"}</p>
        <p>
          Start the server and use its printed URL. No cloud account is
          required.
        </p>
      </main>
    );
  const clips = p!.clips.map((clip) =>
      draft?.id === clip.id ? { ...clip, ...draft.patch } : clip,
    ),
    sorted = [...clips].sort(
      (a, b) =>
        a.track - b.track || a.start - b.start || a.id.localeCompare(b.id),
    );
  const selectedClip = p!.clips.find((c) => c.id === selected);
  const canAnchorClip =
    !!selectedClip &&
    time >= selectedClip.start &&
    time < selectedClip.start + selectedClip.duration;
  const captureAnchor = (mode: string): CommentAnchor =>
    mode === "clip" && canAnchorClip
      ? {
          type: "clip",
          clipId: selectedClip!.id,
          sourceTime: selectedClip!.in + time - selectedClip!.start,
          ...(selectedClip!.assetId
            ? { sourceAssetId: selectedClip!.assetId }
            : {}),
        }
      : { type: "timeline", time: Math.round(time * p!.fps) / p!.fps };
  const beginComment = () => {
    setPlaying(false);
    setShowComments(true);
    if (!commentTarget)
      setCommentTarget(captureAnchor(canAnchorClip ? "clip" : "timeline"));
    requestAnimationFrame(() => commentInput.current?.focus());
  };
  const finishCommentEdit = (id: string) => {
    setEditingComment(null);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `[data-comment="${id}"] button[aria-label="Edit comment"]`,
        )
        ?.focus(),
    );
  };
  const comments = [...(p!.comments ?? [])].sort(
    (a, b) => Number(a.status === "resolved") - Number(b.status === "resolved"),
  );
  return (
    <main
      className="editor"
      style={
        {
          "--timeline-height": `${timelineFraction * 100}dvh`,
        } as React.CSSProperties
      }
    >
      <header>
        <div className="header-actions">
          <span className={"connection " + (connected ? "online" : "")}>
            {connected ? "Connected" : "Reconnecting…"}
          </span>
          <span className="revision">rev {p!.revision}</span>
          <button
            aria-label="Toggle comments"
            title="Comments (C)"
            aria-keyshortcuts="C"
            aria-expanded={showComments}
            onClick={() => setShowComments((v) => !v)}
          >
            <Icon name="comment" />
            <span className="control-count">{comments.length || ""}</span>
          </button>
          <button
            aria-label="Toggle transcript"
            title="Transcript (T)"
            aria-keyshortcuts="T"
            aria-expanded={showTranscript}
            onClick={() => setShowTranscript((v) => !v)}
          >
            <Icon name="transcript" />
          </button>
          <button
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            aria-expanded={showShortcuts}
            onClick={() => setShowShortcuts((v) => !v)}
          >
            <Icon name="keyboard" />
          </button>
        </div>
      </header>
      {showShortcuts && (
        <aside className="shortcut-panel" aria-label="Keyboard shortcuts">
          <div className="section-title">
            <h2>Shortcuts</h2>
            <button
              aria-label="Close shortcuts"
              title="Close (Esc)"
              onClick={() => setShowShortcuts(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <dl>
            {shortcuts.map(([keys, action]) => (
              <div key={keys}>
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </aside>
      )}
      {(notice || state.error) && (
        <div className="alert" role="alert">
          {notice || state.error}
          <button onClick={() => setNotice("")} aria-label="Dismiss notice">
            ×
          </button>
        </div>
      )}
      <DockLayout
        panels={[
          {
            id: "preview",
            title: "Preview",
            visible: true,
            content: (
              <section className="viewer panel">
                <div className="preview-area" aria-label="Composition preview">
                  <div
                    className="stage"
                    ref={stage}
                    tabIndex={-1}
                    onPointerDown={() =>
                      stage.current?.focus({ preventScroll: true })
                    }
                    style={{
                      aspectRatio: `${p!.width}/${p!.height}`,
                      width: `min(100cqw, ${(p!.width / p!.height) * 100}cqh)`,
                      marginInline: "auto",
                    }}
                  >
                    <div
                      style={{
                        width: p!.width,
                        height: p!.height,
                        transform: `scale(${scale})`,
                        transformOrigin: "top left",
                        position: "absolute",
                        inset: 0,
                      }}
                    >
                      {sorted
                        .filter((clip) => !p!.layers?.[clip.track]?.disabled)
                        .map((clip) =>
                          clip.kind === "video" ? (
                            <VideoLayer
                              key={clip.id}
                              clip={{
                                ...clip,
                                muted:
                                  clip.muted ||
                                  !!p!.layers?.[clip.track]?.muted,
                              }}
                              time={time}
                              playing={playing}
                              playbackRate={playbackRate}
                              report={setNotice}
                            />
                          ) : clip.kind === "graphics" &&
                            previewBridge ? null : state.boxes[clip.id] ? (
                            <div
                              key={clip.id}
                              style={{
                                display:
                                  time >= clip.start &&
                                  time < clip.start + clip.duration
                                    ? "block"
                                    : "none",
                                position: "absolute",
                                left: clip.x,
                                top: clip.y,
                                width: clip.width,
                                height: clip.height,
                              }}
                            >
                              {state.boxes[clip.id].map((b, i) => (
                                <div
                                  key={i}
                                  style={{
                                    position: "absolute",
                                    left: b.x,
                                    top: b.y,
                                    width: b.width,
                                    height: b.height,
                                    background: b.color,
                                  }}
                                />
                              ))}
                            </div>
                          ) : (
                            <div
                              key={clip.id}
                              className="unsupported"
                              hidden={
                                time < clip.start ||
                                time >= clip.start + clip.duration
                              }
                            >
                              Agent-managed: {clip.kind}
                            </div>
                          ),
                        )}
                      {previewBridge?.overlay && (
                        <GraphicsLayer
                          overlay={previewBridge.overlay}
                          time={time}
                          playing={playing}
                          playbackRate={playbackRate}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="transport">
                  <button
                    aria-label={playing ? "Pause" : "Play"}
                    title={playing ? "Pause (Space)" : "Play (Space)"}
                    aria-keyshortcuts="Space"
                    disabled={!connected}
                    onClick={() => {
                      takeRange.current = null;
                      if (time >= duration) setTime(0);
                      setPlaying((v) => !v);
                    }}
                  >
                    <Icon name={playing ? "pause" : "play"} />
                  </button>
                  <select
                    className="playback-speed"
                    aria-label="Playback speed"
                    title="Playback speed"
                    value={playbackRate}
                    onChange={(e) => setPlaybackRate(Number(e.target.value))}
                  >
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}×
                      </option>
                    ))}
                  </select>
                  <span className="time">
                    {seconds(time)} <span>/ {seconds(duration)}</span>
                  </span>
                  <TakeSelector
                    project={p!}
                    disabled={disabled}
                    stop={() => {
                      takeRange.current = null;
                      setPlaying(false);
                    }}
                    choose={(sectionId, takeId) =>
                      mutate("take-choice", { sectionId, takeId })
                    }
                    preview={(start, end, clipId) => {
                      takeRange.current = { start, end };
                      setSelected(clipId);
                      setTime(start);
                      setPlaying(true);
                    }}
                  />
                </div>
              </section>
            ),
          },
          {
            id: "comments",
            title: "Comments",
            visible: showComments,
            content: (
              <aside className="panel comments" aria-label="Comments">
                <div id="comments-panel">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const anchor =
                        commentTarget ??
                        captureAnchor(canAnchorClip ? "clip" : "timeline");
                      if (
                        await mutate("comment", { body: commentBody, anchor })
                      ) {
                        setCommentBody("");
                        setCommentTarget(null);
                      }
                    }}
                  >
                    <textarea
                      ref={commentInput}
                      aria-label="Comment"
                      placeholder="Leave feedback at the playhead…"
                      maxLength={10000}
                      value={commentBody}
                      onFocus={beginComment}
                      onChange={(e) => setCommentBody(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          if (!e.repeat && !disabled && commentBody.trim())
                            e.currentTarget.form?.requestSubmit();
                        }
                      }}
                    />
                    <div className="comment-compose-actions">
                      <select
                        aria-label="Comment attachment"
                        value={
                          commentTarget?.type ??
                          (canAnchorClip ? "clip" : "timeline")
                        }
                        onChange={(e) => {
                          setPlaying(false);
                          setCommentTarget(captureAnchor(e.target.value));
                        }}
                      >
                        <option value="timeline">Timeline moment</option>
                        <option
                          value="clip"
                          disabled={
                            !canAnchorClip && commentTarget?.type !== "clip"
                          }
                        >
                          Follow clip/source
                        </option>
                      </select>
                      <button
                        disabled={disabled || !commentBody.trim()}
                        aria-label="Post comment"
                        title="Post comment (Enter) · Shift+Enter for a new line"
                        aria-keyshortcuts="Enter Control+Enter Meta+Enter"
                      >
                        <Icon name="send" />
                      </button>
                    </div>
                    {commentTarget && (
                      <p className="subtle">
                        {commentTarget.type === "clip"
                          ? `${p!.clips.find((c) => c.id === commentTarget.clipId)?.name ?? "Missing clip"} · source ${seconds(commentTarget.sourceTime)}`
                          : `Timeline ${seconds(commentTarget.time)}`}
                      </p>
                    )}
                  </form>
                  <div className="comment-list">
                    {!comments.length && (
                      <p className="subtle">No comments yet.</p>
                    )}
                    {comments.map((comment, index) => {
                      const position = locateComment(p!, comment);
                      return (
                        <React.Fragment key={comment.id}>
                          {comment.status === "resolved" &&
                            comments[index - 1]?.status !== "resolved" && (
                              <h3 className="comment-group-label">Resolved</h3>
                            )}
                          <article
                            data-comment={comment.id}
                            tabIndex={-1}
                            data-editing={editingComment?.id === comment.id}
                            className={
                              comment.status === "resolved" ? "resolved" : ""
                            }
                          >
                            <div className="comment-meta">
                              <button
                                className="quiet"
                                disabled={position.time === null}
                                onClick={() => {
                                  setPlaying(false);
                                  setTime(position.time!);
                                  setShowComments(true);
                                  if (comment.anchor.type === "clip")
                                    setSelected(comment.anchor.clipId);
                                }}
                              >
                                {position.time === null
                                  ? {
                                      "missing-clip": "Clip removed",
                                      "source-changed": "Source replaced",
                                      "trimmed-out": "Outside clip trim",
                                      "outside-timeline": "Beyond timeline",
                                    }[position.reason!]
                                  : seconds(position.time)}
                              </button>
                              <button
                                className="quiet edit-comment"
                                aria-label="Edit comment"
                                title="Edit comment"
                                disabled={disabled || !!editingComment}
                                onClick={() => {
                                  setPlaying(false);
                                  setEditingComment({
                                    id: comment.id,
                                    body: comment.body,
                                    original: comment.body,
                                  });
                                }}
                              >
                                <Icon name="edit" />
                              </button>
                              <button
                                className="quiet"
                                aria-label={
                                  comment.status === "open"
                                    ? "Resolve"
                                    : "Reopen"
                                }
                                title={
                                  comment.status === "open"
                                    ? "Resolve comment"
                                    : "Reopen comment"
                                }
                                disabled={disabled}
                                onClick={() =>
                                  mutate("comment-update", {
                                    id: comment.id,
                                    patch: {
                                      status:
                                        comment.status === "open"
                                          ? "resolved"
                                          : "open",
                                    },
                                  })
                                }
                              >
                                <Icon
                                  name={
                                    comment.status === "open"
                                      ? "check"
                                      : "reopen"
                                  }
                                />
                              </button>
                            </div>
                            {editingComment?.id === comment.id ? (
                              <form
                                className="comment-edit"
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  if (
                                    comment.body !== editingComment.original ||
                                    !editingComment.body.trim() ||
                                    disabled
                                  )
                                    return;
                                  if (
                                    editingComment.body === comment.body ||
                                    (await mutate("comment-update", {
                                      id: comment.id,
                                      patch: { body: editingComment.body },
                                    }))
                                  )
                                    finishCommentEdit(comment.id);
                                }}
                              >
                                <textarea
                                  aria-label="Edit comment text"
                                  disabled={pending}
                                  autoFocus
                                  maxLength={10000}
                                  value={editingComment.body}
                                  onChange={(e) =>
                                    setEditingComment({
                                      ...editingComment,
                                      body: e.target.value,
                                    })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      finishCommentEdit(comment.id);
                                    }
                                    if (
                                      e.key === "Enter" &&
                                      !e.shiftKey &&
                                      !e.nativeEvent.isComposing
                                    ) {
                                      e.preventDefault();
                                      if (!e.repeat)
                                        e.currentTarget.form?.requestSubmit();
                                    }
                                  }}
                                />
                                {comment.body !== editingComment.original && (
                                  <p className="subtle" role="status">
                                    This comment changed elsewhere. Your draft
                                    is kept here; cancel to view the saved
                                    version.
                                  </p>
                                )}
                                <div className="comment-edit-actions">
                                  <button
                                    type="button"
                                    aria-label="Cancel comment edit"
                                    title="Cancel (Escape)"
                                    disabled={pending}
                                    onClick={() =>
                                      finishCommentEdit(comment.id)
                                    }
                                  >
                                    <Icon name="close" />
                                  </button>
                                  <button
                                    type="submit"
                                    aria-label="Save comment"
                                    title="Save comment (Enter) · Shift+Enter for a new line"
                                    aria-keyshortcuts="Enter Control+Enter Meta+Enter"
                                    disabled={
                                      disabled ||
                                      !editingComment.body.trim() ||
                                      comment.body !== editingComment.original
                                    }
                                  >
                                    <Icon name="check" />
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <p>{comment.body}</p>
                            )}
                            <small>
                              {comment.anchor.type === "clip"
                                ? "Follows clip/source"
                                : "Timeline moment"}
                              {comment.status === "resolved"
                                ? " · Resolved"
                                : ""}
                            </small>
                          </article>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </aside>
            ),
          },
          {
            id: "transcript",
            title: "Transcript",
            visible: showTranscript,
            content: (
              <aside className="panel transcript-dock" aria-label="Transcript">
                <TranscriptPanel
                  project={p!}
                  selectedAsset={selectedClip?.assetId}
                  time={time}
                  disabled={disabled}
                  importCues={(assetId, transcript) =>
                    mutate("transcript", { assetId, transcript })
                  }
                  seek={(clipId, at) => {
                    setSelected(clipId);
                    setPlaying(false);
                    setTime(at);
                  }}
                  report={setNotice}
                />
              </aside>
            ),
          },
        ]}
      />
      <div
        className="panel-divider"
        role="separator"
        tabIndex={0}
        aria-label="Resize timeline"
        aria-orientation="horizontal"
        aria-valuemin={20}
        aria-valuemax={65}
        aria-valuenow={Math.round(timelineFraction * 100)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dividerDrag.current = { y: e.clientY, fraction: timelineFraction };
        }}
        onPointerMove={(e) => {
          if (dividerDrag.current)
            setTimelineFraction(
              Math.max(
                0.2,
                Math.min(
                  0.65,
                  dividerDrag.current.fraction +
                    (dividerDrag.current.y - e.clientY) / window.innerHeight,
                ),
              ),
            );
        }}
        onPointerUp={() => {
          dividerDrag.current = null;
        }}
        onPointerCancel={() => {
          dividerDrag.current = null;
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            setTimelineFraction((v) =>
              Math.max(
                0.2,
                Math.min(0.65, v + (e.key === "ArrowUp" ? 0.05 : -0.05)),
              ),
            );
          }
        }}
      />
      <section
        className="panel timeline-panel"
        inert={previewBridge?.locked || undefined}
      >
        {draft && (
          <output className="edit-feedback" aria-live="off">
            {drag.current?.mode === "move" ? "↔" : "↤↦"}{" "}
            {seconds(draft.patch.start ?? drag.current!.clip.start)} ·{" "}
            {(draft.patch.duration ?? drag.current!.clip.duration).toFixed(3)}s
            {snapGuide !== null ? " · snap" : ""}
          </output>
        )}
        <div className="section-title timeline-tools">
          <div>
            <h2>Timeline</h2>
            <span className="nav-hint">
              Scroll to pan · Ctrl/⌘ + scroll to zoom · Space + drag
            </span>
          </div>
          <ClipControls
            project={p!}
            clip={selectedClip}
            time={time}
            disabled={disabled || !!draft}
            update={(patch) => {
              if (
                selectedClip &&
                Object.entries(patch).some(
                  ([key, value]) => selectedClip[key] !== value,
                )
              )
                void mutate("clip", { id: selectedClip.id, patch });
            }}
          />
          <div>
            <button
              disabled={disabled}
              onClick={beginComment}
              aria-label="Comment here"
              title="Comment here (M)"
              aria-keyshortcuts="M"
            >
              <Icon name="comment" />
            </button>
            <button
              disabled={
                disabled ||
                !selectedClip ||
                time <= selectedClip.start ||
                time >= selectedClip.start + selectedClip.duration
              }
              onClick={() => mutate("split", { id: selected, time })}
              aria-label="Split"
              title="Split (S)"
              aria-keyshortcuts="S"
            >
              <Icon name="split" />
            </button>
            <button
              disabled={disabled || !selectedClip}
              onClick={() => mutate("delete", { id: selected })}
              aria-label="Remove"
              title="Remove (Delete / Backspace)"
              aria-keyshortcuts="Delete Backspace"
            >
              <Icon name="remove" />
            </button>
            <button
              disabled={disabled || !state.canUndo}
              onClick={() => mutate("undo")}
              aria-label="Undo"
              title="Undo (Ctrl/⌘+Z)"
              aria-keyshortcuts="Control+Z Meta+Z"
            >
              <Icon name="undo" />
            </button>
            <button
              disabled={disabled || !state.canRedo}
              onClick={() => mutate("redo")}
              aria-label="Redo"
              title="Redo (Ctrl/⌘+Shift+Z)"
              aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
            >
              <Icon name="redo" />
            </button>
            <div className="zoom" title="Timeline zoom (− / +)">
              <button
                aria-label="Fit timeline"
                title="Fit full timeline (F)"
                aria-keyshortcuts="F"
                aria-pressed={fitView}
                onClick={fitTimeline}
              >
                <Icon name="zoom" />
              </button>
              <input
                aria-label="Timeline zoom"
                type="range"
                min={minZoom}
                step={0.01}
                max={160}
                value={zoom}
                onChange={(e) => {
                  setFitView(false);
                  setZoom(+e.target.value);
                }}
              />
            </div>
          </div>
        </div>
        <div
          className={`timeline-scroll ${handReady ? "hand-ready" : ""} ${panning ? "panning" : ""}`}
          ref={timelineScroll}
          onPointerDownCapture={(e) => {
            if (!spaceGesture.current.held && e.button !== 1) return;
            if (e.button !== 0 && e.button !== 1) return;
            e.preventDefault();
            e.stopPropagation();
            spaceGesture.current.used = true;
            const v = e.currentTarget;
            pan.current = {
              x: e.clientX,
              y: e.clientY,
              left: v.scrollLeft,
              top: v.scrollTop,
              id: e.pointerId,
            };
            v.setPointerCapture(e.pointerId);
            setPanning(true);
          }}
          onPointerMoveCapture={(e) => {
            if (!pan.current) return;
            e.preventDefault();
            e.stopPropagation();
            const v = e.currentTarget;
            v.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
            v.scrollTop = pan.current.top - (e.clientY - pan.current.y);
          }}
          onPointerUpCapture={(e) => {
            if (pan.current) {
              e.preventDefault();
              e.stopPropagation();
              finishPan();
            }
          }}
          onPointerCancel={finishPan}
        >
          <div
            className="timeline"
            tabIndex={-1}
            onPointerDown={(e) => {
              if (
                !(e.target as HTMLElement).closest(
                  "button, [data-clip], .ruler",
                )
              )
                e.currentTarget.focus({ preventScroll: true });
            }}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={() => {
              drag.current = null;
              setDraft(null);
              setSnapGuide(null);
            }}
            style={{
              width: Math.max(
                timelineWidth,
                (duration + paddingTime) * zoom + 132,
              ),
            }}
          >
            <div
              className="ruler"
              role="slider"
              aria-label="Timeline playhead"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={time}
              tabIndex={0}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                e.preventDefault();
                e.currentTarget.focus({ preventScroll: true });
                e.currentTarget.setPointerCapture(e.pointerId);
                scrub.current = true;
                seek(e.clientX, e.currentTarget);
              }}
              onPointerMove={(e) => {
                if (scrub.current) seek(e.clientX, e.currentTarget);
              }}
              onPointerUp={() => {
                scrub.current = false;
              }}
              onPointerCancel={() => {
                scrub.current = false;
              }}
              style={{ marginLeft: 100 }}
            >
              {Array.from(
                {
                  length: Math.floor((duration + paddingTime) / rulerStep) + 1,
                },
                (_, tick) => {
                  const i = tick * rulerStep;
                  return (
                    <span key={i} style={{ left: i * zoom }}>
                      {i >= 60
                        ? `${Math.floor(i / 60)}:${String(i % 60).padStart(2, "0")}`
                        : `${i}s`}
                    </span>
                  );
                },
              )}
              {comments
                .filter((c) => c.status === "open")
                .map((comment) => {
                  const position = locateComment({ ...p!, clips }, comment);
                  return position.time === null ? null : (
                    <button
                      key={comment.id}
                      className="comment-marker"
                      aria-label={`Comment: ${comment.body}`}
                      title={comment.body}
                      style={{ left: position.time * zoom }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlaying(false);
                        setTime(position.time!);
                        setShowComments(true);
                        document
                          .querySelector(`[data-comment="${comment.id}"]`)
                          ?.scrollIntoView({ block: "nearest" });
                      }}
                    >
                      ●
                    </button>
                  );
                })}
            </div>
            {layoutTimeline(clips, zoom).map(({ track, items, laneCount }) => (
              <div
                className="track"
                key={track}
                data-track={track}
                data-muted={!!p!.layers?.[track]?.muted}
                data-disabled={!!p!.layers?.[track]?.disabled}
                style={{ height: laneCount * LANE_HEIGHT }}
              >
                <span className="track-name">
                  Layer {track}
                  <span className="layer-controls">
                    <button
                      aria-label={`${p!.layers?.[track]?.muted ? "Unmute" : "Mute"} layer ${track}`}
                      aria-pressed={!!p!.layers?.[track]?.muted}
                      title="Mute layer audio (Shift+M for selected layer)"
                      disabled={disabled}
                      onClick={() =>
                        mutate("layer", {
                          track,
                          patch: { muted: !p!.layers?.[track]?.muted },
                        })
                      }
                    >
                      <Icon
                        name={p!.layers?.[track]?.muted ? "mute" : "volume"}
                      />
                    </button>
                    <button
                      aria-label={`${p!.layers?.[track]?.disabled ? "Enable" : "Disable"} layer ${track}`}
                      aria-pressed={!!p!.layers?.[track]?.disabled}
                      title="Disable layer video and audio (Shift+V for selected layer)"
                      disabled={disabled}
                      onClick={() =>
                        mutate("layer", {
                          track,
                          patch: { disabled: !p!.layers?.[track]?.disabled },
                        })
                      }
                    >
                      <Icon
                        name={p!.layers?.[track]?.disabled ? "eye-off" : "eye"}
                      />
                    </button>
                  </span>
                </span>
                <div className="track-clips">
                  {items.map(({ clip, lane }) => (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`Clip ${clip.name}`}
                      aria-pressed={selected === clip.id}
                      title={`${clip.name} · drag to move · edges to trim · hold Shift to snap`}
                      data-clip={clip.id}
                      data-lane={lane}
                      data-editing={draft?.id === clip.id}
                      key={clip.id}
                      className={`clip ${clip.kind === "video" ? "video" : "graphic"} ${selected === clip.id ? "selected" : ""}`}
                      style={{
                        left: clip.start * zoom,
                        width: clipWidth(clip, zoom),
                        top: 6 + lane * LANE_HEIGHT,
                      }}
                      onClick={() => setSelected(clip.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setSelected(clip.id);
                      }}
                      onPointerDown={(e) => begin(e, clip, "move")}
                    >
                      {clip.kind === "video" &&
                        p!.assets.find((a) => a.id === clip.assetId) && (
                          <ClipMedia
                            clip={{
                              ...clip,
                              muted:
                                clip.muted ||
                                !!p!.layers?.[clip.track]?.muted ||
                                !!p!.layers?.[clip.track]?.disabled,
                            }}
                            asset={p!.assets.find(
                              (a) => a.id === clip.assetId,
                            )!}
                            zoom={zoom}
                            url={resource("media-preview", {
                              id: clip.assetId!,
                            })}
                          />
                        )}
                      {clip.kind === "graphics" &&
                        previewBridge?.overlay?.thumbnails && (
                          <ClipMedia
                            clip={clip}
                            zoom={zoom}
                            url={(() => {
                              const url = new URL(
                                previewBridge.overlay!.url,
                                location.origin,
                              );
                              url.pathname = "/chat/graphics-preview";
                              url.searchParams.set("clip", clip.id);
                              return url.href;
                            })()}
                          />
                        )}
                      <span
                        role="button"
                        aria-label={`Trim start ${clip.name}`}
                        tabIndex={selected === clip.id ? 0 : -1}
                        title="Drag to trim · Left/Right: 1 frame · Shift: 10 frames"
                        onKeyDown={(e) => {
                          if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!disabled && !e.repeat)
                              void mutate("clip", {
                                id: clip.id,
                                patch: dragClip(
                                  p!,
                                  clip,
                                  "left",
                                  ((e.key === "ArrowLeft" ? -1 : 1) *
                                    (e.shiftKey ? 10 : 1)) /
                                    p!.fps,
                                ),
                              });
                          }
                        }}
                        className="handle left"
                        onPointerDown={(e) => begin(e, clip, "left")}
                      />
                      <span className="clip-text">
                        <b>{clip.name}</b>
                        <small>
                          {clip.duration.toFixed(2)}s{" "}
                          {clip.muted ? "· muted" : ""}
                        </small>
                      </span>
                      <span
                        role="button"
                        aria-label={`Trim end ${clip.name}`}
                        tabIndex={selected === clip.id ? 0 : -1}
                        title="Drag to trim · Left/Right: 1 frame · Shift: 10 frames"
                        onKeyDown={(e) => {
                          if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!disabled && !e.repeat)
                              void mutate("clip", {
                                id: clip.id,
                                patch: dragClip(
                                  p!,
                                  clip,
                                  "right",
                                  ((e.key === "ArrowLeft" ? -1 : 1) *
                                    (e.shiftKey ? 10 : 1)) /
                                    p!.fps,
                                ),
                              });
                          }
                        }}
                        className="handle right"
                        onPointerDown={(e) => begin(e, clip, "right")}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {snapGuide !== null && (
              <div
                className="snap-guide"
                style={{ left: 100 + snapGuide * zoom }}
              />
            )}
            <div className="playhead" style={{ left: 100 + time * zoom }} />
          </div>
        </div>
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
