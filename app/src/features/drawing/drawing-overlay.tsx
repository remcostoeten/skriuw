import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { redo, undo } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import {
  drawingCapacity,
  isEmptyDrawingLayer,
  parseDrawingLayer,
  simplifyStrokePoints,
  type DrawingElement,
  type DrawingLayer,
  type DrawingShape,
  type DrawingShapeKind,
  type DrawingStroke,
} from "@/features/editor/drawing-layer";
import {
  DRAWING_SHORTCUT_IDS,
  type DrawingShortcutId,
} from "@/features/editor/editor-bound-shortcut-ids";
import {
  useEditorBoundShortcuts,
  type EditorBoundHandlersFor,
} from "@/features/editor/use-editor-bound-shortcuts";
import { useShortcutHints } from "@/commands/hints";
import { projectSettings } from "@/features/settings/settings-model";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";
import {
  DEFAULT_BRUSH,
  brushWidth,
  clampStrokeWidth,
  isDarkBackground,
  isInkingTool,
  isShapeTool,
  stepBrushWidth,
  withBrushWidth,
  type DrawingBrush,
  type DrawingToolId,
} from "./drawing-brush";
import { paintDrawingElement, paintDrawingLayer } from "./drawing-canvas";
import {
  constrainGesture,
  isDegenerateGesture,
  movePlacement,
  stampedGesture,
  type GesturePoint,
} from "./drawing-geometry";
import { DrawingInkPicker } from "./drawing-ink-picker";
import { DrawingToolbar } from "./drawing-toolbar";

type Props = {
  store: RendererStore;
  noteId: string;
  active: boolean;
  getView: () => EditorView | null;
  onDone: () => void;
};

type LiveStroke = {
  pointerId: number;
  points: number[];
};

type LiveShape = {
  pointerId: number;
  kind: DrawingShapeKind;
  from: GesturePoint;
  to: GesturePoint;
  shift: boolean;
};

type SizeIndicator = {
  x: number;
  y: number;
  width: number;
};

/**
 * The last brush each note was annotated with, for the length of the session.
 * Picking up where the reader left off is worth remembering, but not worth a
 * settings write per stroke.
 */
const BRUSH_BY_NOTE = new Map<string, DrawingBrush>();

const SIZE_INDICATOR_MS = 700;

/** The stored layer payload, read straight off the document root. */
function documentDrawingAttribute(state: RendererState, noteId: string): unknown {
  const record = state.documents.get(noteId);
  if (!record) return null;
  const json = record.documentJson as { attrs?: { drawing?: unknown } } | null;
  return json?.attrs?.drawing ?? null;
}

function selectTheme(state: RendererState): string {
  return projectSettings(state.settings).theme;
}

function readBackgroundLightness(): boolean {
  return isDarkBackground(
    getComputedStyle(document.documentElement).getPropertyValue("--background"),
  );
}

/**
 * The note's annotation layer.
 *
 * While idle the overlay paints persisted ink and nothing else: no pointer
 * events, no live handlers, and no element at all when the note has never been
 * drawn on. Entering annotate mode hands the surface pointer events and adds
 * one floating toolbar — see ADR-0035.
 *
 * Each finished gesture dispatches one transaction on the editor that owns the
 * note, so ink joins the document the same way typing does: one undo step per
 * stroke, and the editor's existing save debounce coalesces the writes. That
 * replaces v1's own commit timer, which existed only because v1 wrote to the
 * note directly.
 */
export function DrawingOverlay({ store, noteId, active, getView, onDone }: Props) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollHostRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const liveRef = useRef<LiveStroke | null>(null);
  const liveShapeRef = useRef<LiveShape | null>(null);
  const [placement, setPlacement] = useState<GesturePoint | null>(null);
  const placementRef = useRef(placement);
  placementRef.current = placement;
  const [brush, setBrush] = useState<DrawingBrush>(
    () => BRUSH_BY_NOTE.get(noteId) ?? DEFAULT_BRUSH,
  );
  const [dark, setDark] = useState(true);
  const [sizeIndicator, setSizeIndicator] = useState<SizeIndicator | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [atCapacity, setAtCapacity] = useState(false);
  const [committedAt, setCommittedAt] = useState(0);

  const selectLayerSource = useMemo(
    () => (state: RendererState) => documentDrawingAttribute(state, noteId),
    [noteId],
  );
  const storedSource = useRendererSelector(store, selectLayerSource);
  const theme = useRendererSelector(store, selectTheme);
  const hints = useShortcutHints(store, DRAWING_SHORTCUT_IDS);

  const getViewRef = useRef(getView);
  getViewRef.current = getView;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const storedSourceRef = useRef(storedSource);
  storedSourceRef.current = storedSource;
  const layerCacheRef = useRef<{ source: unknown; layer: DrawingLayer | null }>({
    source: undefined,
    layer: null,
  });

  /**
   * The editor's document is the live truth; the stored record only catches up
   * when the save lands. Parsing is cached on the payload's identity, which
   * changes only when a transaction rewrites it.
   */
  const currentLayer = useCallback((): DrawingLayer | null => {
    const view = getViewRef.current();
    const source = view ? (view.state.doc.attrs.drawing ?? null) : storedSourceRef.current;
    const cache = layerCacheRef.current;
    if (source !== cache.source) {
      layerCacheRef.current = { source, layer: parseDrawingLayer(source) };
    }
    return layerCacheRef.current.layer;
  }, []);

  const paintNow = useCallback(() => {
    frameRef.current = null;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const viewport = {
      width,
      height,
      scrollTop: scrollHostRef.current?.scrollTop ?? 0,
      dark: darkRef.current,
    };
    paintDrawingLayer(context, currentLayer(), viewport);
    const live = liveRef.current;
    if (live) {
      paintDrawingElement(context, liveStrokeElement(live, brushRef.current), viewport);
    }
    const shape = liveShapeRef.current;
    if (shape) {
      paintDrawingElement(context, liveShapeElement(shape, brushRef.current), viewport);
    }
    const cursor = placementRef.current;
    if (cursor && isShapeTool(brushRef.current.tool)) {
      const stamped = stampedGesture(cursor);
      paintDrawingElement(
        context,
        liveShapeElement(
          {
            pointerId: -1,
            kind: brushRef.current.tool,
            from: stamped.from,
            to: stamped.to,
            shift: false,
          },
          brushRef.current,
        ),
        viewport,
      );
    }
  }, [currentLayer]);

  const schedulePaint = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(paintNow);
  }, [paintNow]);

  useEffect(() => {
    if (!host) return;
    const scrollHost = host.parentElement?.querySelector<HTMLElement>(".editor-scroll") ?? null;
    scrollHostRef.current = scrollHost;
    setDark(readBackgroundLightness());
    schedulePaint();
    const onScroll = () => schedulePaint();
    scrollHost?.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => schedulePaint());
    observer.observe(host);
    return () => {
      scrollHost?.removeEventListener("scroll", onScroll);
      observer.disconnect();
      scrollHostRef.current = null;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [host, schedulePaint]);

  useEffect(() => {
    setDark(readBackgroundLightness());
  }, [theme]);

  useEffect(() => {
    schedulePaint();
  }, [storedSource, committedAt, dark, schedulePaint]);

  useEffect(() => {
    BRUSH_BY_NOTE.set(noteId, brush);
  }, [brush, noteId]);

  useEffect(() => {
    if (active && host) host.focus({ preventScroll: true });
  }, [active, host]);

  useEffect(() => {
    if (!active) setPicker(null);
  }, [active]);

  useEffect(() => {
    if (!isShapeTool(brush.tool)) setPlacement(null);
  }, [brush.tool]);

  useEffect(() => {
    schedulePaint();
  }, [placement, brush, schedulePaint]);

  const finish = useCallback(() => {
    const editor = scrollHostRef.current?.querySelector<HTMLElement>(".ProseMirror");
    onDoneRef.current();
    editor?.focus();
  }, []);

  /** Adds one finished element to the document, or reports that it cannot. */
  const commitElement = useCallback(
    (element: DrawingElement): void => {
      const view = getViewRef.current();
      if (!view) return;
      const layer = currentLayer();
      const capacity = drawingCapacity(layer);
      const points = element.kind === "stroke" ? element.points.length / 2 : 0;
      if (capacity.elements < 1 || points > capacity.points) {
        setAtCapacity(true);
        return;
      }
      setAtCapacity(false);
      const next: DrawingLayer = {
        version: 1,
        elements: [...(layer?.elements ?? []), element],
      };
      view.dispatch(view.state.tr.setDocAttribute("drawing", next));
      setCommittedAt(Date.now());
    },
    [currentLayer],
  );

  const commitElementRef = useRef(commitElement);
  commitElementRef.current = commitElement;

  /** Where the keyboard placement cursor starts when no drag has set it. */
  const centreOfViewport = useCallback((): GesturePoint => {
    const canvas = canvasRef.current;
    const scrollTop = scrollHostRef.current?.scrollTop ?? 0;
    return {
      x: (canvas?.clientWidth ?? 0) / 2,
      y: scrollTop + (canvas?.clientHeight ?? 0) / 2,
    };
  }, []);

  const documentPoint = useCallback((clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    return [
      clientX - rect.left,
      clientY - rect.top + (scrollHostRef.current?.scrollTop ?? 0),
    ];
  }, []);

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!active || event.button !== 0) return;
    if (!isInkingTool(brush.tool)) return;
    setPicker(null);
    setPlacement(null);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = documentPoint(event.clientX, event.clientY);
    if (isShapeTool(brush.tool)) {
      liveShapeRef.current = {
        pointerId: event.pointerId,
        kind: brush.tool,
        from: { x, y },
        to: { x, y },
        shift: event.shiftKey,
      };
    } else {
      liveRef.current = { pointerId: event.pointerId, points: [x, y] };
    }
    schedulePaint();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const shape = liveShapeRef.current;
    if (shape && shape.pointerId === event.pointerId) {
      event.preventDefault();
      const [x, y] = documentPoint(event.clientX, event.clientY);
      shape.to = { x, y };
      shape.shift = event.shiftKey;
      schedulePaint();
      return;
    }
    const live = liveRef.current;
    if (!live || live.pointerId !== event.pointerId) return;
    event.preventDefault();
    const native = event.nativeEvent;
    const samples =
      typeof native.getCoalescedEvents === "function" && native.getCoalescedEvents().length > 0
        ? native.getCoalescedEvents()
        : [native];
    for (const sample of samples) {
      const [x, y] = documentPoint(sample.clientX, sample.clientY);
      live.points.push(x, y);
    }
    schedulePaint();
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const shape = liveShapeRef.current;
    if (shape && shape.pointerId === event.pointerId) {
      liveShapeRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const settled: LiveShape = { ...shape, shift: event.shiftKey };
      const to = settled.shift
        ? constrainGesture(settled.kind, settled.from, settled.to)
        : settled.to;
      if (!isDegenerateGesture(settled.from, to)) {
        commitElement({
          ...liveShapeElement({ ...settled, to, shift: false }, brush),
          id: newElementId(),
        });
      }
      schedulePaint();
      return;
    }
    const live = liveRef.current;
    if (!live || live.pointerId !== event.pointerId) return;
    liveRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const points = simplifyStrokePoints(live.points);
    if (points.length >= 2) {
      commitElement({ ...liveStrokeElement({ ...live, points }, brush), id: newElementId() });
    }
    schedulePaint();
  }

  /**
   * The overlay covers the scrollable note, so the wheel cannot mean both brush
   * size and scrolling. Plain wheel sizes the brush and ctrl+wheel scrolls the
   * note, and neither is preventDefaulted unless annotate mode is on.
   */
  useEffect(() => {
    if (!host || !active) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      if (event.ctrlKey) {
        const scrollHost = scrollHostRef.current;
        if (scrollHost) scrollHost.scrollTop += event.deltaY;
        return;
      }
      if (!isInkingTool(brushRef.current.tool)) return;
      const step = event.deltaY > 0 ? -1 : 1;
      const next = withBrushWidth(
        brushRef.current,
        clampStrokeWidth(brushWidth(brushRef.current) + step),
      );
      setBrush(next);
      setSizeIndicator({ x: event.clientX, y: event.clientY, width: brushWidth(next) });
    }
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [host, active]);

  useEffect(() => {
    if (!sizeIndicator) return;
    const timer = window.setTimeout(() => setSizeIndicator(null), SIZE_INDICATOR_MS);
    return () => window.clearTimeout(timer);
  }, [sizeIndicator]);

  /**
   * Escape leaves, undo and redo reach the editor that owns the document even
   * though focus sits here, and every other bare single-character key stops at
   * the overlay rather than reaching a window binding. `stopPropagation` does
   * not silence this element's own listeners, so the tool bindings below still
   * fire and typing a custom color still works.
   */
  useEffect(() => {
    if (!host || !active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (liveRef.current || liveShapeRef.current) {
          liveRef.current = null;
          liveShapeRef.current = null;
          schedulePaint();
          return;
        }
        if (placementRef.current) {
          setPlacement(null);
          schedulePaint();
          return;
        }
        finish();
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        const view = getViewRef.current();
        if (!view) return;
        event.preventDefault();
        event.stopPropagation();
        const run = event.shiftKey ? redo : undo;
        run(view.state, view.dispatch);
        setCommittedAt(Date.now());
        return;
      }
      if (mod || event.altKey) return;
      if (isShapeTool(brushRef.current.tool)) {
        const moved = movePlacement(
          placementRef.current ?? centreOfViewport(),
          event.key,
          event.shiftKey,
        );
        if (moved) {
          event.preventDefault();
          event.stopPropagation();
          setPlacement(moved);
          schedulePaint();
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          const at = placementRef.current;
          if (at) {
            event.preventDefault();
            event.stopPropagation();
            const stamped = stampedGesture(at);
            commitElementRef.current({
              ...liveShapeElement(
                {
                  pointerId: -1,
                  kind: brushRef.current.tool as DrawingShapeKind,
                  from: stamped.from,
                  to: stamped.to,
                  shift: false,
                },
                brushRef.current,
              ),
              id: newElementId(),
            });
            schedulePaint();
            return;
          }
        }
      }
      if (event.key.length === 1) event.stopPropagation();
    }
    host.addEventListener("keydown", onKeyDown, { capture: true });
    return () => host.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [host, active, finish, schedulePaint, centreOfViewport]);

  const handlers = useMemo<EditorBoundHandlersFor<DrawingShortcutId>>(() => {
    const selectTool = (tool: DrawingToolId) => () =>
      setBrush((current) => ({ ...current, tool }));
    const selectInk = (colorId: string) => () =>
      setBrush((current) => ({ ...current, colorId }));
    return {
      drawPen: selectTool("pen"),
      drawHighlighter: selectTool("highlighter"),
      drawLine: selectTool("line"),
      drawRectangle: selectTool("rect"),
      drawEllipse: selectTool("ellipse"),
      drawEraser: selectTool("eraser"),
      drawSelect: selectTool("select"),
      drawToggleFill: () => setBrush((current) => ({ ...current, filled: !current.filled })),
      drawWidthDecrease: () => setBrush((current) => stepBrushWidth(current, -1)),
      drawWidthIncrease: () => setBrush((current) => stepBrushWidth(current, 1)),
      drawInkDefault: selectInk("ink"),
      drawInkRed: selectInk("red"),
      drawInkOrange: selectInk("orange"),
      drawInkYellow: selectInk("yellow"),
      drawInkGreen: selectInk("green"),
      drawInkTeal: selectInk("teal"),
      drawInkBlue: selectInk("blue"),
      drawInkViolet: selectInk("violet"),
    };
  }, []);
  const activeScopes = useMemo(() => (active ? ["drawing"] : []), [active]);
  useEditorBoundShortcuts(store, active ? host : null, handlers, activeScopes);

  if (!active && isEmptyDrawingLayer(currentLayer())) return null;

  return (
    <div
      ref={setHost}
      className="drawing-overlay"
      data-active={active ? "true" : undefined}
      aria-hidden={active ? undefined : "true"}
      tabIndex={active ? -1 : undefined}
      aria-label={active ? "Annotation layer" : undefined}
    >
      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={(event) => {
          if (!active) return;
          event.preventDefault();
          setPicker({ x: event.clientX, y: event.clientY });
        }}
      />
      {active ? (
        <DrawingToolbar
          brush={brush}
          dark={dark}
          hints={hints}
          onSelectTool={(tool) => setBrush((current) => ({ ...current, tool }))}
          onSelectInk={(colorId) => setBrush((current) => ({ ...current, colorId }))}
          onToggleFill={() => setBrush((current) => ({ ...current, filled: !current.filled }))}
          onPickCustomInk={() => {
            const rect = host?.getBoundingClientRect();
            setPicker({ x: (rect?.left ?? 0) + 24, y: (rect?.top ?? 0) + 52 });
          }}
          onDone={finish}
        />
      ) : null}
      {active && picker ? (
        <DrawingInkPicker
          x={picker.x}
          y={picker.y}
          dark={dark}
          colorId={brush.colorId}
          onSelect={(colorId) => {
            setBrush((current) => ({ ...current, colorId }));
            setPicker(null);
            host?.focus({ preventScroll: true });
          }}
          onClose={() => {
            setPicker(null);
            host?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      {active && sizeIndicator ? (
        <span
          className="drawing-size-indicator"
          style={{ left: sizeIndicator.x, top: sizeIndicator.y }}
          aria-hidden="true"
        >
          {Math.round(sizeIndicator.width)}
        </span>
      ) : null}
      {active && atCapacity ? (
        <p className="drawing-capacity-notice" role="status">
          This note's annotation layer is full. Erase something to keep drawing.
        </p>
      ) : null}
    </div>
  );
}

function liveStrokeElement(live: LiveStroke, brush: DrawingBrush): DrawingStroke {
  return {
    id: "live",
    kind: "stroke",
    tool: brush.tool === "highlighter" ? "highlighter" : "pen",
    color: brush.colorId,
    width: brushWidth(brush),
    points: live.points,
  };
}

function liveShapeElement(shape: LiveShape, brush: DrawingBrush): DrawingShape {
  const to = shape.shift ? constrainGesture(shape.kind, shape.from, shape.to) : shape.to;
  return {
    id: "live",
    kind: shape.kind,
    color: brush.colorId,
    width: brushWidth(brush),
    filled: shape.kind !== "line" && brush.filled,
    x1: shape.from.x,
    y1: shape.from.y,
    x2: to.x,
    y2: to.y,
  };
}

function newElementId(): string {
  return crypto.randomUUID();
}
