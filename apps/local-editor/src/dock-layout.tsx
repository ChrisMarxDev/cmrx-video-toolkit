import React, { useEffect, useRef, useState } from "react";

type Panel = {
  id: string;
  title: string;
  visible: boolean;
  content: React.ReactNode;
};
const defaults = {
  order: ["transcript", "preview", "comments"],
  weights: { transcript: 23, preview: 54, comments: 23 } as Record<
    string,
    number
  >,
};
const storageKey = "editor-dock-layout-v1";
function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (
      saved &&
      Array.isArray(saved.order) &&
      saved.order.length === 3 &&
      new Set(saved.order).size === 3 &&
      defaults.order.every(
        (id) =>
          saved.order.includes(id) &&
          Number.isFinite(saved.weights?.[id]) &&
          saved.weights[id] > 0 &&
          saved.weights[id] <= 100,
      )
    )
      return saved as typeof defaults;
  } catch {
    /* Storage can be disabled. */
  }
  return defaults;
}

// Layout is a browser preference, never an authored project edit.
export function DockLayout({ panels }: { panels: Panel[] }) {
  const [layout, setLayout] = useState(loadLayout);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const resize = useRef<{
    x: number;
    width: number;
    left: string;
    right: string;
    leftWeight: number;
    rightWeight: number;
  } | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      /* Optional preference. */
    }
  }, [layout]);
  const visible = layout.order
    .map((id) => panels.find((p) => p.id === id)!)
    .filter((p) => p.visible);
  const reorder = (from: string, to: string) => {
    setLayout((current) => {
      const order = [...current.order];
      const a = order.indexOf(from),
        b = order.indexOf(to);
      [order[a], order[b]] = [order[b], order[a]];
      return { ...current, order };
    });
  };
  const resizePair = (
    left: string,
    right: string,
    amount: number,
    leftWeight = layout.weights[left],
    rightWeight = layout.weights[right],
  ) => {
    const total = leftWeight + rightWeight;
    const next = Math.max(
      total * 0.2,
      Math.min(total * 0.8, leftWeight + amount),
    );
    setLayout((current) => ({
      ...current,
      weights: { ...current.weights, [left]: next, [right]: total - next },
    }));
  };
  return (
    <div className="workspace-grid" data-pane-count={visible.length}>
      {visible.map((panel, index) => (
        <React.Fragment key={panel.id}>
          {index > 0 && (
            <div
              className="dock-divider"
              role="separator"
              tabIndex={0}
              aria-label={`Resize ${visible[index - 1].title} and ${panel.title}`}
              aria-orientation="vertical"
              aria-valuemin={20}
              aria-valuemax={80}
              aria-valuenow={Math.round(
                (100 * layout.weights[visible[index - 1].id]) /
                  (layout.weights[visible[index - 1].id] +
                    layout.weights[panel.id]),
              )}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const left = visible[index - 1].id,
                  right = panel.id;
                const width =
                  e.currentTarget.previousElementSibling!.getBoundingClientRect()
                    .width +
                  e.currentTarget.nextElementSibling!.getBoundingClientRect()
                    .width;
                resize.current = {
                  x: e.clientX,
                  width,
                  left,
                  right,
                  leftWeight: layout.weights[left],
                  rightWeight: layout.weights[right],
                };
              }}
              onPointerMove={(e) => {
                const d = resize.current;
                if (d)
                  resizePair(
                    d.left,
                    d.right,
                    ((e.clientX - d.x) / d.width) *
                      (d.leftWeight + d.rightWeight),
                    d.leftWeight,
                    d.rightWeight,
                  );
              }}
              onPointerUp={() => {
                resize.current = null;
              }}
              onPointerCancel={() => {
                resize.current = null;
              }}
              onLostPointerCapture={() => {
                resize.current = null;
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  e.stopPropagation();
                  resizePair(
                    visible[index - 1].id,
                    panel.id,
                    e.key === "ArrowLeft" ? -3 : 3,
                  );
                }
              }}
            />
          )}
          <div
            className="dock-pane"
            data-pane={panel.id}
            data-drop-target={dropTarget === panel.id}
            style={{ flexGrow: layout.weights[panel.id] }}
            onDragOver={(e) => {
              if (dragged && dragged !== panel.id) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropTarget(panel.id);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged && dragged !== panel.id) reorder(dragged, panel.id);
              setDragged(null);
              setDropTarget(null);
            }}
          >
            <div
              className="dock-title"
              draggable
              tabIndex={0}
              role="button"
              aria-label={`Move ${panel.title} panel`}
              title="Drag to another pane to swap · Alt + Left/Right to move"
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", panel.id);
                e.dataTransfer.effectAllowed = "move";
                setDragged(panel.id);
              }}
              onDragEnd={() => {
                setDragged(null);
                setDropTarget(null);
              }}
              onKeyDown={(e) => {
                if (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
                  e.preventDefault();
                  e.stopPropagation();
                  const target =
                    visible[index + (e.key === "ArrowLeft" ? -1 : 1)];
                  if (target) reorder(panel.id, target.id);
                }
              }}
            >
              <span className="dock-grip" aria-hidden="true">
                ⠿
              </span>
              {panel.title}
            </div>
            {panel.content}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
