import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isEmptyDrawingLayer,
  parseDrawingLayer,
  type DrawingLayer,
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
  isDarkBackground,
  stepBrushWidth,
  type DrawingBrush,
  type DrawingToolId,
} from "./drawing-brush";
import { paintDrawingLayer } from "./drawing-canvas";
import { DrawingToolbar } from "./drawing-toolbar";

type Props = {
  store: RendererStore;
  noteId: string;
  active: boolean;
  onDone: () => void;
};

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

/**
 * The note's annotation layer.
 *
 * While idle the overlay paints persisted ink and nothing else: no pointer
 * events, no live handlers, and no element at all when the note has never been
 * drawn on. Entering annotate mode hands the surface pointer events and adds
 * one floating toolbar — see ADR-0035.
 */
export function DrawingOverlay({ store, noteId, active, onDone }: Props) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollHostRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [brush, setBrush] = useState<DrawingBrush>(DEFAULT_BRUSH);
  const [dark, setDark] = useState(true);

  const selectLayerSource = useMemo(
    () => (state: RendererState) => documentDrawingAttribute(state, noteId),
    [noteId],
  );
  const layerSource = useRendererSelector(store, selectLayerSource);
  const layer = useMemo(() => parseDrawingLayer(layerSource), [layerSource]);
  const theme = useRendererSelector(store, selectTheme);
  const hints = useShortcutHints(store, DRAWING_SHORTCUT_IDS);

  const paintInputsRef = useRef<{ layer: DrawingLayer | null; dark: boolean }>({ layer, dark });
  paintInputsRef.current = { layer, dark };
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

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
    paintDrawingLayer(context, paintInputsRef.current.layer, {
      width,
      height,
      scrollTop: scrollHostRef.current?.scrollTop ?? 0,
      dark: paintInputsRef.current.dark,
    });
  }, []);

  const schedulePaint = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(paintNow);
  }, [paintNow]);

  useEffect(() => {
    if (!host) return;
    const scrollHost = host.parentElement?.querySelector<HTMLElement>(".editor-scroll") ?? null;
    scrollHostRef.current = scrollHost;
    setDark(isDarkBackground(getComputedStyle(document.documentElement).getPropertyValue("--background")));
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
    setDark(
      isDarkBackground(getComputedStyle(document.documentElement).getPropertyValue("--background")),
    );
  }, [theme]);

  useEffect(() => {
    schedulePaint();
  }, [layer, dark, schedulePaint]);

  useEffect(() => {
    if (active && host) host.focus({ preventScroll: true });
  }, [active, host]);

  const finish = useCallback(() => {
    const editor = scrollHostRef.current?.querySelector<HTMLElement>(".ProseMirror");
    onDoneRef.current();
    editor?.focus();
  }, []);

  /**
   * Escape leaves, and every other bare single-character key stops here rather
   * than reaching a window binding. `stopPropagation` does not silence the
   * overlay's own listeners on this element, so the tool bindings below still
   * fire and typing into the color field still works.
   */
  useEffect(() => {
    if (!host || !active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length === 1) event.stopPropagation();
    }
    host.addEventListener("keydown", onKeyDown, { capture: true });
    return () => host.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [host, active, finish]);

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

  if (!active && isEmptyDrawingLayer(layer)) return null;

  return (
    <div
      ref={setHost}
      className="drawing-overlay"
      data-active={active ? "true" : undefined}
      aria-hidden={active ? undefined : "true"}
      tabIndex={active ? -1 : undefined}
      aria-label={active ? "Annotation layer" : undefined}
    >
      <canvas ref={canvasRef} className="drawing-canvas" />
      {active ? (
        <DrawingToolbar
          brush={brush}
          dark={dark}
          hints={hints}
          onSelectTool={(tool) => setBrush((current) => ({ ...current, tool }))}
          onSelectInk={(colorId) => setBrush((current) => ({ ...current, colorId }))}
          onToggleFill={() => setBrush((current) => ({ ...current, filled: !current.filled }))}
          onPickCustomInk={() => undefined}
          onDone={finish}
        />
      ) : null}
    </div>
  );
}
