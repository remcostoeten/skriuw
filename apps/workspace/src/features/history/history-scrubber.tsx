import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { cn } from "@/shared/lib/utils";
import {
  clampPosition,
  clampZoom,
  followWindow,
  fractionToPosition,
  listIndexToPosition,
  pointerDistance,
  positionToFraction,
  positionToListIndex,
  positionsPerPixel,
  zoomWindow,
  type ScrubberWindow,
} from "./history-scrubber-model";
import { formatVersionTimestamp, type VersionListItem } from "./version-model";

type Props = {
  versions: readonly VersionListItem[];
  selectedIndex: number | null;
  onScrub: (listIndex: number) => void;
};

type Gesture =
  | { kind: "drag"; startX: number; lastX: number; startPosition: number; moved: boolean; tap: boolean }
  | { kind: "pinch"; startDistance: number; startZoom: number };

type Live = {
  position: number;
  view: ScrubberWindow;
  zoom: number;
  selectedIndex: number | null;
  onScrub: (listIndex: number) => void;
};

const EDGE_PX = 20;
const EDGE_PAN_RATE = 0.15;
const TAP_SLOP_PX = 4;
const WHEEL_STEP_PX = 32;
const WHEEL_LINE_PX = 16;
const ZOOM_STEP = 1.6;
const PAGE_STEP = 10;

function dayOf(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dayBoundaries(versions: readonly VersionListItem[]): boolean[] {
  const count = versions.length;
  return versions.map((_, offset) => {
    const listIndex = count - 1 - offset;
    const current = versions[listIndex];
    const older = versions[listIndex + 1];
    return !older || !current || dayOf(current.createdAt) !== dayOf(older.createdAt);
  });
}

export function HistoryScrubber({ versions, selectedIndex, onScrub }: Props) {
  const count = versions.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<Gesture | null>(null);
  const frameRef = useRef(0);
  const wheelRef = useRef(0);
  const emittedRef = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [windowStart, setWindowStart] = useState(0);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const [gesturing, setGesturing] = useState(false);

  const position = dragPosition ?? listIndexToPosition(selectedIndex ?? 0, count);
  const view = followWindow(position, count, zoom, windowStart);
  const activeIndex = positionToListIndex(position, count);
  const active = versions[activeIndex];
  const startsDay = useMemo(() => dayBoundaries(versions), [versions]);

  const live = useRef<Live>({ position, view, zoom, selectedIndex, onScrub });
  useLayoutEffect(() => {
    live.current = { position, view, zoom, selectedIndex, onScrub };
  });

  function trackWidth(): number {
    return trackRef.current?.getBoundingClientRect().width ?? 0;
  }

  function emit(listIndex: number): void {
    if (listIndex === emittedRef.current) {
      return;
    }
    emittedRef.current = listIndex;
    live.current.onScrub(listIndex);
  }

  function moveTo(next: number, dragging: boolean): void {
    const current = live.current;
    const clamped = clampPosition(next, count);
    const nextView = followWindow(clamped, count, current.zoom, current.view.start);
    live.current = { ...current, position: clamped, view: nextView };
    setWindowStart(nextView.start);
    if (dragging) {
      setDragPosition(clamped);
    }
    emit(positionToListIndex(clamped, count));
  }

  function step(delta: number): void {
    emittedRef.current = live.current.selectedIndex;
    moveTo(Math.round(live.current.position) + delta, false);
  }

  function jumpTo(target: number): void {
    emittedRef.current = live.current.selectedIndex;
    moveTo(target, false);
  }

  function applyZoom(nextZoom: number): void {
    const current = live.current;
    const clamped = clampZoom(nextZoom, count, trackWidth());
    const nextView = zoomWindow(current.position, count, clamped, current.view);
    live.current = { ...current, zoom: clamped, view: nextView };
    setZoom(clamped);
    setWindowStart(nextView.start);
  }

  function dragTo(gesture: Extract<Gesture, { kind: "drag" }>): void {
    const offset = (gesture.lastX - gesture.startX) * positionsPerPixel(live.current.view, trackWidth());
    moveTo(gesture.startPosition + offset, true);
  }

  function positionAt(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      return live.current.position;
    }
    return fractionToPosition((clientX - rect.left) / rect.width, live.current.view);
  }

  function panAtEdges(): void {
    const gesture = gestureRef.current;
    const track = trackRef.current;
    if (!gesture) {
      return;
    }
    if (gesture.kind === "drag" && gesture.moved && track && live.current.zoom > 1) {
      const rect = track.getBoundingClientRect();
      const overshoot =
        gesture.lastX < rect.left + EDGE_PX
          ? gesture.lastX - rect.left - EDGE_PX
          : gesture.lastX > rect.right - EDGE_PX
            ? gesture.lastX - rect.right + EDGE_PX
            : 0;
      if (overshoot !== 0) {
        gesture.startPosition += overshoot * EDGE_PAN_RATE * positionsPerPixel(live.current.view, rect.width);
        dragTo(gesture);
      }
    }
    frameRef.current = requestAnimationFrame(panAtEdges);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    const pointers = pointersRef.current;
    if (pointers.size >= 2) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      if (first && second) {
        gestureRef.current = {
          kind: "pinch",
          startDistance: Math.max(pointerDistance(first, second), 1),
          startZoom: live.current.zoom,
        };
      }
      return;
    }

    emittedRef.current = live.current.selectedIndex;
    const touch = event.pointerType === "touch";
    let startPosition = live.current.position;
    if (!touch) {
      event.preventDefault();
      handleRef.current?.focus({ preventScroll: true });
      if (!handleRef.current?.contains(event.target as Node)) {
        startPosition = clampPosition(positionAt(event.clientX), count);
      }
    }
    moveTo(startPosition, true);
    gestureRef.current = {
      kind: "drag",
      startX: event.clientX,
      lastX: event.clientX,
      startPosition,
      moved: false,
      tap: touch,
    };
    setGesturing(true);
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(panAtEdges);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    const pointers = pointersRef.current;
    const point = pointers.get(event.pointerId);
    if (!point) {
      return;
    }
    point.x = event.clientX;
    point.y = event.clientY;
    const gesture = gestureRef.current;
    if (gesture?.kind === "pinch") {
      const [first, second] = [...pointers.values()];
      if (first && second) {
        applyZoom((gesture.startZoom * pointerDistance(first, second)) / gesture.startDistance);
      }
      return;
    }
    if (gesture?.kind !== "drag") {
      return;
    }
    gesture.lastX = event.clientX;
    if (Math.abs(gesture.lastX - gesture.startX) > TAP_SLOP_PX) {
      gesture.moved = true;
    }
    dragTo(gesture);
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>): void {
    const pointers = pointersRef.current;
    if (!pointers.delete(event.pointerId)) {
      return;
    }
    const gesture = gestureRef.current;
    const [remaining] = [...pointers.values()];
    if (gesture?.kind === "pinch" && remaining) {
      gestureRef.current = {
        kind: "drag",
        startX: remaining.x,
        lastX: remaining.x,
        startPosition: live.current.position,
        moved: true,
        tap: false,
      };
      return;
    }
    if (pointers.size > 0) {
      return;
    }
    if (gesture?.kind === "drag" && gesture.tap && !gesture.moved && event.type === "pointerup") {
      moveTo(positionAt(event.clientX), true);
    }
    gestureRef.current = null;
    cancelAnimationFrame(frameRef.current);
    setDragPosition(null);
    setGesturing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const amount = event.shiftKey ? PAGE_STEP : 1;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        step(-amount);
        break;
      case "ArrowRight":
      case "ArrowUp":
        step(amount);
        break;
      case "PageDown":
        step(-PAGE_STEP);
        break;
      case "PageUp":
        step(PAGE_STEP);
        break;
      case "Home":
        jumpTo(0);
        break;
      case "End":
        jumpTo(count - 1);
        break;
      case "+":
      case "=":
        applyZoom(live.current.zoom * ZOOM_STEP);
        break;
      case "-":
        applyZoom(live.current.zoom / ZOOM_STEP);
        break;
      case "0":
        applyZoom(1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  const wheelHandlerRef = useRef<(event: WheelEvent) => void>(() => undefined);
  wheelHandlerRef.current = (event: WheelEvent) => {
    event.preventDefault();
    if (event.ctrlKey) {
      applyZoom(live.current.zoom * Math.exp(-event.deltaY * 0.01));
      return;
    }
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? WHEEL_LINE_PX : 1;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
    wheelRef.current += delta * scale;
    const steps = Math.trunc(wheelRef.current / WHEEL_STEP_PX);
    if (steps !== 0) {
      wheelRef.current -= steps * WHEEL_STEP_PX;
      step(steps);
    }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const listener = (event: WheelEvent) => wheelHandlerRef.current(event);
    root.addEventListener("wheel", listener, { passive: false });
    return () => {
      root.removeEventListener("wheel", listener);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const fraction = positionToFraction(position, view);
  const firstTick = Math.max(0, Math.floor(view.start));
  const lastTick = Math.min(count - 1, Math.ceil(view.start + view.size));
  const snapped = Math.round(position);
  const zoomed = zoom > 1.01;
  const settle = !gesturing && "transition-[left] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none";

  const ticks = [];
  for (let tick = firstTick; tick <= lastTick; tick += 1) {
    const isDay = startsDay[tick] ?? false;
    ticks.push(
      <span
        key={tick}
        className={cn(
          "absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2 rounded-full",
          isDay ? "h-4 bg-muted-foreground/55" : "h-2 bg-muted-foreground/25",
          tick === snapped && "h-3 bg-foreground/70",
          settle,
        )}
        style={{ left: `${positionToFraction(tick, view) * 100}%` }}
      />,
    );
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Revision timeline"
      className="pointer-events-auto w-full max-w-[520px] rounded-[calc(var(--radius)+4px)] border border-border bg-popover px-5 pb-1 pt-2 text-popover-foreground shadow-[0_12px_28px_-12px_hsl(var(--scrim)/0.32)]"
    >
      <div className="flex h-5 items-center gap-2 text-[11px]">
        <span className="min-w-0 truncate font-[560] text-foreground">
          {active ? formatVersionTimestamp(active.createdAt) : null}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {count - activeIndex}/{count}
        </span>
        <button
          type="button"
          tabIndex={zoomed ? 0 : -1}
          aria-hidden={!zoomed}
          aria-label="Reset timeline zoom"
          onClick={() => applyZoom(1)}
          className={cn(
            "ml-auto h-5 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border-none bg-theme-hover px-1.5 font-mono text-[10px] tabular-nums text-theme-secondary transition-opacity hover:text-foreground",
            !zoomed && "pointer-events-none opacity-0",
          )}
        >
          {zoom.toFixed(1)}×
        </button>
      </div>
      <div
        ref={trackRef}
        className="relative h-10 cursor-ew-resize touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-theme-divider" />
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          {ticks}
        </div>
        <div
          ref={handleRef}
          role="slider"
          tabIndex={0}
          aria-label="Scrub revisions"
          aria-orientation="horizontal"
          aria-valuemin={1}
          aria-valuemax={count}
          aria-valuenow={count - activeIndex}
          aria-valuetext={active ? `${formatVersionTimestamp(active.createdAt)}, ${active.summary}` : undefined}
          aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight + - 0"
          onKeyDown={handleKeyDown}
          className={cn("group absolute top-0 grid h-full w-8 -translate-x-1/2 place-items-center outline-none", settle)}
          style={{ left: `${fraction * 100}%` }}
        >
          <span
            className={cn(
              "block h-6 w-[5px] rounded-full bg-foreground shadow-[0_0_0_3px_hsl(var(--popover))] transition-transform duration-150 motion-reduce:transition-none",
              "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-popover",
              gesturing && "scale-y-125",
            )}
          />
        </div>
      </div>
    </div>
  );
}
