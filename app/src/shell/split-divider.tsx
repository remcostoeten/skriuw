import { useEffect, useRef, useState } from "react";
import {
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  clampSplitRatio,
  type SplitOrientation,
} from "@/store/panes";
import { SPLIT_COARSE_STEP, SPLIT_NUDGE_STEP, ratioAtPointer } from "./split-layout";

type Props = {
  orientation: SplitOrientation;
  ratio: number;
  onPreview: (ratio: number) => void;
  onCommit: (ratio: number) => void;
  onReset: () => void;
};

function percent(ratio: number): number {
  return Math.round(ratio * 100);
}

/**
 * The draggable divider between split editor panes. Drags preview through the
 * parent's direct grid-track write and commit a single ratio on release, so the
 * editors never re-render mid-drag.
 */
export function SplitDivider({ orientation, ratio, onPreview, onCommit, onReset }: Props) {
  const [dragging, setDragging] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<{ start: number; extent: number } | null>(null);
  const draftRef = useRef(ratio);

  useEffect(() => {
    if (dragging) {
      return;
    }
    draftRef.current = ratio;
  }, [dragging, ratio]);

  useEffect(() => {
    if (!dragging) {
      return;
    }
    let position = 0;
    let frame = 0;

    function apply() {
      frame = 0;
      const track = trackRef.current;
      if (!track) {
        return;
      }
      draftRef.current = ratioAtPointer(position, track.start, track.extent);
      onPreview(draftRef.current);
    }

    function handleMove(event: PointerEvent) {
      position = orientation === "vertical" ? event.clientX : event.clientY;
      if (frame === 0) {
        frame = window.requestAnimationFrame(apply);
      }
    }
    function handleUp() {
      setDragging(false);
    }

    const bodyClass = orientation === "vertical" ? "split-resizing-col" : "split-resizing-row";
    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    document.body.classList.add(bodyClass);
    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      document.body.classList.remove(bodyClass);
      trackRef.current = null;
      onCommit(draftRef.current);
    };
  }, [dragging, onCommit, onPreview, orientation]);

  function nudge(delta: number) {
    onCommit(clampSplitRatio(ratio + delta));
  }

  const shrinkKey = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
  const growKey = orientation === "vertical" ? "ArrowRight" : "ArrowDown";

  return (
    <div
      ref={elementRef}
      role="separator"
      aria-orientation={orientation}
      aria-label="Resize split panes"
      aria-valuenow={percent(ratio)}
      aria-valuemin={percent(MIN_SPLIT_RATIO)}
      aria-valuemax={percent(MAX_SPLIT_RATIO)}
      tabIndex={0}
      className={`split-divider split-divider-${orientation}${
        dragging ? " split-divider-active" : ""
      }`}
      onPointerDown={(event) => {
        const container = elementRef.current?.parentElement;
        if (dragging || !container) {
          return;
        }
        event.preventDefault();
        const rect = container.getBoundingClientRect();
        trackRef.current =
          orientation === "vertical"
            ? { start: rect.left, extent: rect.width }
            : { start: rect.top, extent: rect.height };
        draftRef.current = ratio;
        setDragging(true);
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onReset();
          return;
        }
        if (event.key !== shrinkKey && event.key !== growKey) {
          return;
        }
        event.preventDefault();
        const step = event.shiftKey ? SPLIT_COARSE_STEP : SPLIT_NUDGE_STEP;
        nudge(event.key === shrinkKey ? -step : step);
      }}
    />
  );
}
