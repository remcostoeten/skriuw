import type { Node as ProseMirrorNode } from "prosemirror-model";
import { NodeSelection, Plugin, PluginKey, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  activeLineIndex,
  isLineUnit,
  lineCount,
  singleLine,
  textblockLines,
  type NumberedLine,
} from "./model";

export type LineNumbersHost = {
  enabled: () => boolean;
  firstNumber: () => number;
};

type Band = { top: number; bottom: number };

type PlacedLine = { line: NumberedLine; top: number; height: number };

const OVERSCAN = 400;
const FALLBACK_ROW_HEIGHT = 24;
const TALL_INLINE_RATIO = 1.5;

const lineNumbersKey = new PluginKey("line-numbers");
const refreshers = new WeakMap<EditorView, () => void>();

function rowHeightOf(view: EditorView): number {
  const height = Number.parseFloat(window.getComputedStyle(view.dom).lineHeight);
  return Number.isFinite(height) && height > 0 ? height : FALLBACK_ROW_HEIGHT;
}

function boxOf(view: EditorView, line: NumberedLine, rowHeight: number): Band | null {
  if (line.anchorKind === "text") {
    try {
      const coords = view.coordsAtPos(line.anchor, 1);
      const tall = coords.bottom - coords.top > rowHeight * TALL_INLINE_RATIO;
      return { top: tall ? coords.bottom - rowHeight : coords.top, bottom: coords.bottom };
    } catch {
      return null;
    }
  }
  const dom = view.nodeDOM(line.anchor);
  if (!(dom instanceof HTMLElement)) {
    return null;
  }
  const rect = dom.getBoundingClientRect();
  return { top: rect.top, bottom: Math.min(rect.bottom, rect.top + rowHeight) };
}

function selectionPosition(state: EditorState): number {
  const selection = state.selection;
  return selection instanceof NodeSelection ? selection.from : selection.head;
}

function visibleLines(view: EditorView, band: Band, firstNumber: number): PlacedLine[] {
  const rowHeight = rowHeightOf(view);
  const placed: PlacedLine[] = [];
  let number = firstNumber;

  function place(line: NumberedLine): Band | null {
    const box = boxOf(view, line, rowHeight);
    if (box && box.bottom > box.top && box.bottom >= band.top && box.top <= band.bottom) {
      placed.push({ line, top: box.top, height: box.bottom - box.top });
    }
    return box;
  }

  function lineAt(block: ProseMirrorNode, pos: number, index: number): NumberedLine | null {
    return textblockLines(block, pos, number, index, index + 1)[0] ?? null;
  }

  function placeTextblock(block: ProseMirrorNode, pos: number): void {
    const count = lineCount(block);
    let low = 0;
    let high = count - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const line = lineAt(block, pos, middle);
      const box = line ? boxOf(view, line, rowHeight) : null;
      if (box && box.bottom < band.top) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    for (let index = low; index < count; index += 1) {
      const line = lineAt(block, pos, index);
      const box = line ? place(line) : null;
      if (box && box.top > band.bottom) {
        break;
      }
    }
  }

  function walk(node: ProseMirrorNode, pos: number): boolean {
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      const rect = dom.getBoundingClientRect();
      const hidden = rect.width === 0 && rect.height === 0;
      if (hidden || rect.bottom < band.top || rect.top > band.bottom) {
        number += lineCount(node);
        return hidden || rect.top <= band.bottom;
      }
    }
    if (!isLineUnit(node)) {
      let offset = 0;
      for (let index = 0; index < node.childCount; index += 1) {
        const child = node.child(index);
        if (!walk(child, pos + 1 + offset)) {
          return false;
        }
        offset += child.nodeSize;
      }
      return true;
    }
    if (node.isTextblock) {
      placeTextblock(node, pos);
    } else {
      place(singleLine(node, pos, number));
    }
    number += lineCount(node);
    return true;
  }

  let offset = 0;
  for (let index = 0; index < view.state.doc.childCount; index += 1) {
    const child = view.state.doc.child(index);
    if (!walk(child, offset)) {
      break;
    }
    offset += child.nodeSize;
  }
  return placed;
}

/**
 * @name createLineNumbersPlugin
 * @description Numbers the lines of the rendered editor in a gutter that hangs
 * into the column's left margin. A line is one break-separated line of a
 * textblock, so every line of a code block gets its own number, while an
 * image, diagram, rule or table row counts as one line whatever its height.
 * Only lines near the viewport are measured, and the numbers follow the
 * layout as images load, text wraps or blocks are inserted.
 *
 * @example
 * createLineNumbersPlugin({ enabled: () => showsEditorLineNumbers(settings), firstNumber: () => 1 });
 */
export function createLineNumbersPlugin(host: LineNumbersHost): Plugin {
  return new Plugin({
    key: lineNumbersKey,
    view(view) {
      const gutter = document.createElement("div");
      gutter.className = "editor-line-numbers";
      gutter.setAttribute("aria-hidden", "true");
      view.dom.parentElement?.appendChild(gutter);
      const rows: HTMLElement[] = [];
      let lines: NumberedLine[] = [];
      let activeRow: HTMLElement | null = null;
      let frame = 0;
      let renderedTop = Number.NaN;

      function markActive(): void {
        const index = activeLineIndex(lines, selectionPosition(view.state));
        const next = index === -1 ? null : (rows[index] ?? null);
        if (next === activeRow) {
          return;
        }
        activeRow?.removeAttribute("data-active");
        next?.setAttribute("data-active", "true");
        activeRow = next;
      }

      function trim(length: number): void {
        while (rows.length > length) {
          rows.pop()?.remove();
        }
      }

      function render(): void {
        frame = 0;
        if (!host.enabled() || !view.dom.isConnected) {
          trim(0);
          lines = [];
          activeRow = null;
          renderedTop = Number.NaN;
          return;
        }
        const origin = gutter.getBoundingClientRect();
        renderedTop = view.dom.getBoundingClientRect().top;
        const placed = visibleLines(
          view,
          { top: -OVERSCAN, bottom: window.innerHeight + OVERSCAN },
          host.firstNumber(),
        );
        trim(placed.length);
        placed.forEach((entry, index) => {
          let row = rows[index];
          if (!row) {
            row = document.createElement("span");
            row.className = "editor-line-number";
            rows.push(row);
            gutter.appendChild(row);
          }
          const label = String(entry.line.number);
          if (row.textContent !== label) {
            row.textContent = label;
          }
          const height = `${Math.round(entry.height * 2) / 2}px`;
          row.style.top = `${Math.round((entry.top - origin.top) * 2) / 2}px`;
          row.style.height = height;
          row.style.lineHeight = height;
        });
        lines = placed.map((entry) => entry.line);
        activeRow?.removeAttribute("data-active");
        activeRow = null;
        markActive();
      }

      function schedule(): void {
        if (frame === 0) {
          frame = window.requestAnimationFrame(render);
        }
      }

      function handleScroll(): void {
        if (!host.enabled() || frame !== 0) {
          return;
        }
        frame = window.requestAnimationFrame(() => {
          const top = view.dom.getBoundingClientRect().top;
          if (Math.abs(top - renderedTop) < OVERSCAN / 2) {
            frame = 0;
            return;
          }
          render();
        });
      }

      const resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(view.dom);
      window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
      window.addEventListener("resize", schedule);
      refreshers.set(view, schedule);
      schedule();

      return {
        update(current, previous) {
          if (current.state.doc !== previous.doc) {
            schedule();
          } else if (!current.state.selection.eq(previous.selection)) {
            markActive();
          }
        },
        destroy() {
          if (frame !== 0) {
            window.cancelAnimationFrame(frame);
          }
          resizeObserver.disconnect();
          window.removeEventListener("scroll", handleScroll, { capture: true });
          window.removeEventListener("resize", schedule);
          refreshers.delete(view);
          gutter.remove();
        },
      };
    },
  });
}

/**
 * @name refreshLineNumbers
 * @description Redraws the gutter after the line-number setting changed,
 * without touching the document or the undo history.
 *
 * @example
 * useEffect(() => refreshLineNumbers(view), [lineNumbers]);
 */
export function refreshLineNumbers(view: EditorView): void {
  refreshers.get(view)?.();
}
