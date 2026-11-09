import { useEffect, useRef, useState } from "react";

const NUDGE_STEP = 16;

export type PanelResizeBounds = {
  minWidth: number;
  maxWidth: number;
  clamp: (width: number) => number;
  shouldCollapse: (width: number) => boolean;
};

type Props = {
  side: "left" | "right";
  label: string;
  bounds: PanelResizeBounds;
  width: number;
  collapsed: boolean;
  offsetBase: number;
  onPreview: (width: number, collapsed: boolean) => void;
  onResize: (width: number) => void;
  onCollapse: (animated: boolean) => void;
  onExpand: (animated: boolean) => void;
  onDragChange: (dragging: boolean) => void;
};

export function PanelResizeHandle({
  side,
  label,
  bounds,
  width,
  collapsed,
  offsetBase,
  onPreview,
  onResize,
  onCollapse,
  onExpand,
  onDragChange,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<{ pointerX: number; width: number } | null>(null);
  const draftRef = useRef({ width, collapsed });

  useEffect(() => {
    if (dragging) {
      return;
    }
    draftRef.current = { width, collapsed };
  }, [collapsed, dragging, width]);

  useEffect(() => {
    if (!dragging) {
      return;
    }
    let pointerX = 0;
    let frame = 0;
    let previewed = { ...draftRef.current };

    function place(trackWidth: number) {
      const element = elementRef.current;
      if (element) {
        element.style[side] = `${offsetBase + trackWidth}px`;
      }
    }

    function apply() {
      frame = 0;
      const origin = originRef.current;
      if (!origin) {
        return;
      }
      const travel = side === "left" ? pointerX - origin.pointerX : origin.pointerX - pointerX;
      const raw = origin.width + travel;
      const collapsedDraft = bounds.shouldCollapse(raw);
      const draft = {
        width: collapsedDraft ? draftRef.current.width : bounds.clamp(raw),
        collapsed: collapsedDraft,
      };
      draftRef.current = draft;
      if (draft.width === previewed.width && draft.collapsed === previewed.collapsed) {
        return;
      }
      previewed = draft;
      place(draft.collapsed ? 0 : draft.width);
      onPreview(draft.width, draft.collapsed);
    }

    function handleMove(event: PointerEvent) {
      pointerX = event.clientX;
      if (frame === 0) {
        frame = window.requestAnimationFrame(apply);
      }
    }
    function handleUp() {
      setDragging(false);
      originRef.current = null;
    }

    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    document.body.classList.add("sidebar-resizing");
    onDragChange(true);
    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      document.body.classList.remove("sidebar-resizing");
      onDragChange(false);
      const draft = draftRef.current;
      if (draft.collapsed) {
        onCollapse(false);
        return;
      }
      onExpand(false);
      onResize(draft.width);
    };
  }, [bounds, dragging, offsetBase, onCollapse, onDragChange, onExpand, onPreview, onResize, side]);

  function nudge(delta: number) {
    const next = bounds.clamp((collapsed ? 0 : width) + delta);
    if (bounds.shouldCollapse(next)) {
      onCollapse(true);
      return;
    }
    onExpand(true);
    onResize(next);
  }

  function grow() {
    nudge(collapsed ? bounds.minWidth : NUDGE_STEP);
  }

  return (
    <div
      ref={elementRef}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={collapsed ? 0 : width}
      aria-valuemin={0}
      aria-valuemax={bounds.maxWidth}
      tabIndex={0}
      style={{ [side]: offsetBase + (collapsed ? 0 : width) }}
      className={`sidebar-resize-handle sidebar-resize-handle-${side}${
        dragging ? " sidebar-resize-handle-active" : ""
      }`}
      onPointerDown={(event) => {
        if (dragging) {
          return;
        }
        event.preventDefault();
        originRef.current = {
          pointerX: event.clientX,
          width: collapsed ? 0 : width,
        };
        draftRef.current = { width, collapsed };
        setDragging(true);
      }}
      onDoubleClick={() => (collapsed ? onExpand(true) : onCollapse(true))}
      onKeyDown={(event) => {
        const shrinkKey = side === "left" ? "ArrowLeft" : "ArrowRight";
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          if (event.key === shrinkKey) {
            nudge(-NUDGE_STEP);
          } else {
            grow();
          }
        }
      }}
    />
  );
}
