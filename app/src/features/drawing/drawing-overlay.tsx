import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { redo, undo } from "prosemirror-history";
import type { EditorView } from "prosemirror-view";
import {
  drawingCapacity,
  isEmptyDrawingLayer,
  readDrawingPayload,
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
  accentFromTriplet,
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
import {
  paintDrawingElement,
  paintDrawingLayer,
  paintMarquee,
  paintSelectionOutline,
} from "./drawing-canvas";
import {
  elementsAlongStroke,
  elementsWithinBox,
  moveElement,
  selectionBounds,
  topmostHit,
} from "./drawing-hit";
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

type EraseGesture = {
  pointerId: number;
  points: number[];
  hit: Set<string>;
};

type SelectGesture = {
  pointerId: number;
  from: GesturePoint;
  to: GesturePoint;
  /** Empty for a rubber band; otherwise the ids being dragged. */
  moving: readonly string[];
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

function readSurfaceTokens(): { dark: boolean; accent: string } {
  const style = getComputedStyle(document.documentElement);
  return {
    dark: isDarkBackground(style.getPropertyValue("--background")),
    accent: accentFromTriplet(style.getPropertyValue("--ring"), "hsl(220 90% 65%)"),
  };
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
  const eraseRef = useRef<EraseGesture | null>(null);
  const selectRef = useRef<SelectGesture | null>(null);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [accent, setAccent] = useState("#7aa2f7");
  const accentRef = useRef(accent);
  accentRef.current = accent;
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
  const layerCacheRef = useRef<{
    source: unknown;
    layer: DrawingLayer | null;
    foreign: boolean;
  }>({ source: undefined, layer: null, foreign: false });
  const [foreign, setForeign] = useState(false);

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
      const payload = readDrawingPayload(source);
      layerCacheRef.current = {
        source,
        layer: payload.kind === "layer" ? payload.layer : null,
        foreign: payload.kind === "foreign",
      };
    }
    return layerCacheRef.current.layer;
  }, []);

  /**
   * A layer this build cannot read is shown as read-only rather than parsed
   * into nothing: editing would replace a payload that belongs to the note,
   * which is the one way ink written by a newer version could be lost.
   */
  const readOnly = foreign;

  const applySurfaceTokens = useCallback(() => {
    const tokens = readSurfaceTokens();
    setDark(tokens.dark);
    setAccent(tokens.accent);
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
    const layer = currentLayer();
    const erasing = eraseRef.current;
    const dragging = selectRef.current;
    const offset =
      dragging && dragging.moving.length > 0
        ? { x: dragging.to.x - dragging.from.x, y: dragging.to.y - dragging.from.y }
        : null;
    const movingIds = new Set(offset && dragging ? dragging.moving : []);
    paintDrawingLayer(
      context,
      offset && layer
        ? {
            ...layer,
            elements: layer.elements.map((element) =>
              movingIds.has(element.id) ? moveElement(element, offset.x, offset.y) : element,
            ),
          }
        : layer,
      viewport,
      { dimmed: erasing?.hit },
    );
    const live = liveRef.current;
    if (live) {
      paintDrawingElement(context, liveStrokeElement(live, brushRef.current), viewport);
    }
    const shape = liveShapeRef.current;
    if (shape) {
      paintDrawingElement(context, liveShapeElement(shape, brushRef.current), viewport);
    }
    if (dragging && dragging.moving.length === 0) {
      paintMarquee(context, dragging.from, dragging.to, viewport, accentRef.current);
    }
    const selected = selectionRef.current;
    if (selected.length > 0 && layer) {
      const chosen = layer.elements
        .filter((element) => selected.includes(element.id))
        .map((element) =>
          offset && movingIds.has(element.id)
            ? moveElement(element, offset.x, offset.y)
            : element,
        );
      const bounds = selectionBounds(chosen);
      if (bounds) paintSelectionOutline(context, bounds, viewport, accentRef.current);
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
    applySurfaceTokens();
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
  }, [host, schedulePaint, applySurfaceTokens]);

  useEffect(() => {
    applySurfaceTokens();
  }, [theme, applySurfaceTokens]);

  useEffect(() => {
    currentLayer();
    setForeign(layerCacheRef.current.foreign);
    schedulePaint();
  }, [storedSource, committedAt, dark, accent, selection, currentLayer, schedulePaint]);

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
    if (brush.tool !== "select") setSelection([]);
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
      if (!view || layerCacheRef.current.foreign) return;
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

  const currentLayerRef = useRef(currentLayer);
  currentLayerRef.current = currentLayer;
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

  /** Replaces the whole element list in one transaction. */
  const commitElements = useCallback(
    (elements: readonly DrawingElement[]): void => {
      const view = getViewRef.current();
      if (!view || layerCacheRef.current.foreign) return;
      const next = elements.length > 0 ? { version: 1, elements: [...elements] } : null;
      view.dispatch(view.state.tr.setDocAttribute("drawing", next));
      setCommittedAt(Date.now());
    },
    [],
  );
  const commitElementsRef = useRef(commitElements);
  commitElementsRef.current = commitElements;

  const eraseElements = useCallback(
    (ids: ReadonlySet<string>): void => {
      if (ids.size === 0) return;
      const layer = currentLayer();
      if (!layer) return;
      commitElementsRef.current(layer.elements.filter((element) => !ids.has(element.id)));
      setSelection((current) => current.filter((id) => !ids.has(id)));
      setAtCapacity(false);
    },
    [currentLayer],
  );
  const eraseElementsRef = useRef(eraseElements);
  eraseElementsRef.current = eraseElements;

  const nudgeSelection = useCallback(
    (deltaX: number, deltaY: number): void => {
      const chosen = selectionRef.current;
      if (chosen.length === 0) return;
      const layer = currentLayer();
      if (!layer) return;
      commitElementsRef.current(
        layer.elements.map((element) =>
          chosen.includes(element.id) ? moveElement(element, deltaX, deltaY) : element,
        ),
      );
    },
    [currentLayer],
  );
  const nudgeSelectionRef = useRef(nudgeSelection);
  nudgeSelectionRef.current = nudgeSelection;

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
    if (!active || readOnly || event.button !== 0) return;
    setPicker(null);
    setPlacement(null);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = documentPoint(event.clientX, event.clientY);
    if (brush.tool === "eraser") {
      const layer = currentLayer();
      const hit = new Set(elementsAlongStroke(layer?.elements ?? [], [x, y]));
      eraseRef.current = { pointerId: event.pointerId, points: [x, y], hit };
      schedulePaint();
      return;
    }
    if (brush.tool === "select") {
      const layer = currentLayer();
      const target = topmostHit(layer?.elements ?? [], { x, y });
      const chosen = target
        ? selectionRef.current.includes(target.id)
          ? selectionRef.current
          : [target.id]
        : [];
      if (!target) setSelection([]);
      else if (chosen !== selectionRef.current) setSelection(chosen);
      selectRef.current = {
        pointerId: event.pointerId,
        from: { x, y },
        to: { x, y },
        moving: target ? chosen : [],
      };
      schedulePaint();
      return;
    }
    if (!isInkingTool(brush.tool)) return;
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
    const erasing = eraseRef.current;
    if (erasing && erasing.pointerId === event.pointerId) {
      event.preventDefault();
      const [x, y] = documentPoint(event.clientX, event.clientY);
      erasing.points.push(x, y);
      const layer = currentLayer();
      for (const id of elementsAlongStroke(layer?.elements ?? [], [x, y])) {
        erasing.hit.add(id);
      }
      schedulePaint();
      return;
    }
    const selecting = selectRef.current;
    if (selecting && selecting.pointerId === event.pointerId) {
      event.preventDefault();
      const [x, y] = documentPoint(event.clientX, event.clientY);
      selecting.to = { x, y };
      schedulePaint();
      return;
    }
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
    const erasing = eraseRef.current;
    if (erasing && erasing.pointerId === event.pointerId) {
      eraseRef.current = null;
      releaseCapture(event);
      eraseElements(erasing.hit);
      schedulePaint();
      return;
    }
    const selecting = selectRef.current;
    if (selecting && selecting.pointerId === event.pointerId) {
      selectRef.current = null;
      releaseCapture(event);
      const deltaX = selecting.to.x - selecting.from.x;
      const deltaY = selecting.to.y - selecting.from.y;
      if (selecting.moving.length > 0) {
        if (deltaX !== 0 || deltaY !== 0) nudgeSelection(deltaX, deltaY);
      } else if (!isDegenerateGesture(selecting.from, selecting.to)) {
        const layer = currentLayer();
        setSelection(elementsWithinBox(layer?.elements ?? [], selecting.from, selecting.to));
      }
      schedulePaint();
      return;
    }
    const shape = liveShapeRef.current;
    if (shape && shape.pointerId === event.pointerId) {
      liveShapeRef.current = null;
      releaseCapture(event);
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
    releaseCapture(event);
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
        if (liveRef.current || liveShapeRef.current || eraseRef.current || selectRef.current) {
          liveRef.current = null;
          liveShapeRef.current = null;
          eraseRef.current = null;
          selectRef.current = null;
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
      if (brushRef.current.tool === "select") {
        if (event.key === "Delete" || event.key === "Backspace") {
          if (selectionRef.current.length === 0) return;
          event.preventDefault();
          event.stopPropagation();
          eraseElementsRef.current(new Set(selectionRef.current));
          return;
        }
        if (event.key === "Tab") {
          const elements = currentLayerRef.current()?.elements ?? [];
          if (elements.length === 0) return;
          event.preventDefault();
          event.stopPropagation();
          setSelection([cycleSelection(elements, selectionRef.current, event.shiftKey)]);
          return;
        }
        const nudge = movePlacement({ x: 0, y: 0 }, event.key, event.shiftKey);
        if (nudge && selectionRef.current.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          nudgeSelectionRef.current(nudge.x, nudge.y);
          return;
        }
      }
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

  if (!active && isEmptyDrawingLayer(currentLayer()) && !foreign) return null;

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
      {active && readOnly ? (
        <p className="drawing-capacity-notice" role="status">
          This note's annotation layer was written by a newer version of Skriuw. It is kept as it
          is, and cannot be edited here.
        </p>
      ) : null}
      {active && atCapacity && !readOnly ? (
        <p className="drawing-capacity-notice" role="status">
          This note's annotation layer is full. Erase something to keep drawing.
        </p>
      ) : null}
    </div>
  );
}

/** Tab walks the layer in paint order so every element is keyboard-reachable. */
function cycleSelection(
  elements: readonly DrawingElement[],
  selection: readonly string[],
  backwards: boolean,
): string {
  const current = elements.findIndex((element) => element.id === selection[0]);
  const step = backwards ? -1 : 1;
  const next = (current + step + elements.length) % elements.length;
  return (elements[current === -1 ? (backwards ? elements.length - 1 : 0) : next] as DrawingElement)
    .id;
}

function releaseCapture(event: ReactPointerEvent<HTMLCanvasElement>): void {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
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
