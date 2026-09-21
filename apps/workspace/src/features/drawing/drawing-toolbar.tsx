import { useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Tooltip } from "@/shared/ui/tooltip";
import {
  CheckIcon,
  CircleIcon,
  DiagonalLineIcon,
  EraserIcon,
  HighlighterIcon,
  PaintBucketIcon,
  PencilIcon,
  PointerIcon,
  SquareIcon,
} from "@/shared/icons/static";
import type { DrawingShortcutId } from "@/features/editor/editor-bound-shortcut-ids";
import {
  DRAWING_INKS,
  brushWidth,
  inkLabel,
  isInkingTool,
  isShapeTool,
  resolveInk,
  type DrawingBrush,
  type DrawingToolId,
} from "./drawing-brush";

type ToolEntry = {
  tool: DrawingToolId;
  label: string;
  shortcutId: DrawingShortcutId;
  icon: typeof PencilIcon;
};

const TOOLS: readonly ToolEntry[] = [
  { tool: "pen", label: "Pen", shortcutId: "drawPen", icon: PencilIcon },
  { tool: "highlighter", label: "Highlighter", shortcutId: "drawHighlighter", icon: HighlighterIcon },
  { tool: "line", label: "Line", shortcutId: "drawLine", icon: DiagonalLineIcon },
  { tool: "rect", label: "Rectangle", shortcutId: "drawRectangle", icon: SquareIcon },
  { tool: "ellipse", label: "Ellipse", shortcutId: "drawEllipse", icon: CircleIcon },
  { tool: "eraser", label: "Eraser", shortcutId: "drawEraser", icon: EraserIcon },
  { tool: "select", label: "Select and move", shortcutId: "drawSelect", icon: PointerIcon },
];

export type DrawingHints = Partial<Record<DrawingShortcutId, string | undefined>>;

type Props = {
  brush: DrawingBrush;
  dark: boolean;
  hints: DrawingHints;
  onSelectTool: (tool: DrawingToolId) => void;
  onSelectInk: (colorId: string) => void;
  onToggleFill: () => void;
  onPickCustomInk: () => void;
  onDone: () => void;
};

/**
 * The only chrome annotate mode adds. Roving tabindex keeps the whole strip one
 * tab stop, and `shift+arrow` mirrors the arrow keys so the 60%-keyboard layout
 * reaches every control without Home or End.
 */
export function DrawingToolbar({
  brush,
  dark,
  hints,
  onSelectTool,
  onSelectInk,
  onToggleFill,
  onPickCustomInk,
  onDone,
}: Props) {
  const [rovingIndex, setRovingIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const inkable = isInkingTool(brush.tool);
  const fillable = isShapeTool(brush.tool) && brush.tool !== "line";
  let itemIndex = -1;

  function itemProps() {
    itemIndex += 1;
    const index = itemIndex;
    return {
      "data-toolbar-item": "",
      tabIndex: index === rovingIndex ? 0 : -1,
      onFocus: () => setRovingIndex(index),
    } as const;
  }

  function moveRovingFocus(event: KeyboardEvent<HTMLDivElement>) {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const first = event.key === "Home";
    const last = event.key === "End";
    if (!forward && !backward && !first && !last) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-toolbar-item]"),
    ).filter((item) => !item.disabled);
    if (items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const current = items.findIndex((item) => item === document.activeElement);
    const from = current === -1 ? 0 : current;
    const next = first
      ? 0
      : last
        ? items.length - 1
        : (from + (forward ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div
      ref={stripRef}
      role="toolbar"
      aria-label="Annotation tools"
      aria-orientation="horizontal"
      className="drawing-toolbar"
      onKeyDown={moveRovingFocus}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {TOOLS.map((entry) => (
        <Tooltip key={entry.tool} label={entry.label} shortcut={hints[entry.shortcutId]} side="bottom">
          <button
            type="button"
            aria-label={entry.label}
            aria-pressed={brush.tool === entry.tool}
            className="drawing-toolbar-item"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelectTool(entry.tool)}
            {...itemProps()}
          >
            <entry.icon size={15} aria-hidden="true" />
          </button>
        </Tooltip>
      ))}

      <ToolbarSeparator />

      <Tooltip label="Fill shapes" shortcut={hints.drawToggleFill} side="bottom">
        <button
          type="button"
          aria-label="Fill shapes"
          aria-pressed={brush.filled}
          disabled={!fillable}
          className="drawing-toolbar-item"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleFill}
          {...itemProps()}
        >
          <PaintBucketIcon size={15} aria-hidden="true" />
        </button>
      </Tooltip>

      <ToolbarSeparator />

      <div role="radiogroup" aria-label="Ink color" className="drawing-toolbar-group">
        {DRAWING_INKS.map((entry) => (
          <Tooltip key={entry.id} label={entry.label} shortcut={entry.key} side="bottom">
            <button
              type="button"
              role="radio"
              aria-label={entry.label}
              aria-checked={brush.colorId === entry.id}
              disabled={!inkable}
              className="drawing-toolbar-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectInk(entry.id)}
              {...itemProps()}
            >
              <span
                className="drawing-swatch"
                data-selected={brush.colorId === entry.id ? "true" : undefined}
                style={{
                  backgroundColor: resolveInk(entry.id, dark),
                  opacity: brush.tool === "highlighter" ? 0.55 : 1,
                }}
              />
            </button>
          </Tooltip>
        ))}
        <Tooltip label="Custom color" shortcut="Right click" side="bottom">
          <button
            type="button"
            aria-label="Custom color"
            disabled={!inkable}
            className="drawing-toolbar-item"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onPickCustomInk}
            {...itemProps()}
          >
            <span
              className="drawing-swatch drawing-swatch-custom"
              data-selected={DRAWING_INKS.every((ink) => ink.id !== brush.colorId) ? "true" : undefined}
              style={{ backgroundColor: resolveInk(brush.colorId, dark) }}
            />
          </button>
        </Tooltip>
      </div>

      <ToolbarSeparator />

      <Tooltip
        label="Stroke width"
        shortcut={`${hints.drawWidthDecrease ?? ""} ${hints.drawWidthIncrease ?? ""}`.trim()}
        side="bottom"
      >
        <span className="drawing-width" aria-hidden="true">
          {Math.round(brushWidth(brush))}
        </span>
      </Tooltip>

      <ToolbarSeparator />

      <Tooltip label="Done" shortcut="Esc" side="bottom">
        <button
          type="button"
          aria-label="Done annotating"
          className="drawing-toolbar-done"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onDone}
          {...itemProps()}
        >
          <CheckIcon size={13} aria-hidden="true" />
          Done
        </button>
      </Tooltip>

      <span aria-live="polite" className="sr-only">
        {describeBrush(brush)}
      </span>
    </div>
  );
}

function ToolbarSeparator(): ReactNode {
  return <span className="drawing-toolbar-separator" aria-hidden="true" />;
}

/** What the live region announces whenever the brush changes. */
export function describeBrush(brush: DrawingBrush): string {
  const tool = TOOLS.find((entry) => entry.tool === brush.tool)?.label ?? brush.tool;
  if (!isInkingTool(brush.tool)) return tool;
  const fill = isShapeTool(brush.tool) && brush.tool !== "line" && brush.filled ? ", filled" : "";
  return `${tool}, ${inkLabel(brush.colorId)}, ${Math.round(brushWidth(brush))} pixels${fill}`;
}
