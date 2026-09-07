import { EditorSelection, StateEffect, StateField, type Extension } from "@codemirror/state";
import { EditorView, GutterMarker, ViewPlugin, gutter, type BlockInfo, type ViewUpdate } from "@codemirror/view";
import {
  buildRowLayout,
  locateRow,
  rowNumberAt,
  rowsForHeight,
  type RawMarkdownRowLayout,
} from "./raw-markdown-editor-model";

export type RawMarkdownRowStatus = {
  /** Document-wide number of the screen row holding the cursor. */
  row: number;
  /** Screen rows in the whole document. */
  rowCount: number;
};

const setActiveRowIndex = StateEffect.define<number>();

const activeRowIndex = StateField.define<number>({
  create: () => 0,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setActiveRowIndex)) {
        return effect.value;
      }
    }
    return value;
  },
});

function measureRowLayout(view: EditorView): RawMarkdownRowLayout {
  const doc = view.state.doc;
  const rowHeight = view.defaultLineHeight;
  const counts: number[] = [];
  for (let number = 1; number <= doc.lines; number += 1) {
    const block = view.lineBlockAt(doc.line(number).from);
    counts.push(rowsForHeight(block.height, rowHeight));
  }
  return buildRowLayout(counts);
}

function measureActiveRowIndex(view: EditorView): number | null {
  const head = view.state.selection.main;
  const line = view.state.doc.lineAt(head.head);
  const headCoords = view.coordsAtPos(head.head, head.assoc || 1);
  const lineCoords = view.coordsAtPos(line.from, 1);
  if (headCoords === null || lineCoords === null || !(view.defaultLineHeight > 0)) {
    return null;
  }
  return Math.max(0, Math.round((headCoords.top - lineCoords.top) / view.defaultLineHeight));
}

/*
 * CodeMirror forbids layout reads and dispatches while it updates, so the row
 * the cursor sits on is measured afterwards and written back once idle; row
 * counts only need the height map, which an update may read.
 */
const rowLayoutPlugin = ViewPlugin.fromClass(
  class RowLayoutPlugin {
    layout: RawMarkdownRowLayout;
    private destroyed = false;

    constructor(view: EditorView) {
      this.layout = measureRowLayout(view);
      this.scheduleActiveRowMeasure(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.geometryChanged || update.viewportChanged) {
        this.layout = measureRowLayout(update.view);
      }
      if (update.docChanged || update.geometryChanged || update.selectionSet) {
        this.scheduleActiveRowMeasure(update.view);
      }
    }

    destroy(): void {
      this.destroyed = true;
    }

    private scheduleActiveRowMeasure(view: EditorView): void {
      view.requestMeasure({
        key: this,
        read: measureActiveRowIndex,
        write: (index, measured) => {
          if (index === null || index === measured.state.field(activeRowIndex)) {
            return;
          }
          queueMicrotask(() => {
            if (!this.destroyed) {
              measured.dispatch({ effects: setActiveRowIndex.of(index) });
            }
          });
        },
      });
    }
  },
);

class RowNumbersMarker extends GutterMarker {
  constructor(
    readonly first: number,
    readonly count: number,
    readonly active: number,
  ) {
    super();
  }

  override eq(other: RowNumbersMarker): boolean {
    return this.first === other.first && this.count === other.count && this.active === other.active;
  }

  override toDOM(): Node {
    const rows = document.createElement("div");
    rows.className = "raw-markdown-rows";
    for (let index = 0; index < this.count; index += 1) {
      const row = document.createElement("span");
      row.className = "raw-markdown-row";
      row.dataset.active = index === this.active ? "true" : "false";
      row.textContent = String(this.first + index);
      rows.appendChild(row);
    }
    return rows;
  }
}

function rowLayoutOf(view: EditorView): RawMarkdownRowLayout {
  return view.plugin(rowLayoutPlugin)?.layout ?? buildRowLayout(new Array<number>(view.state.doc.lines).fill(1));
}

function markerFor(view: EditorView, block: BlockInfo): RowNumbersMarker {
  const layout = rowLayoutOf(view);
  const line = view.state.doc.lineAt(block.from);
  const index = line.number - 1;
  const head = view.state.selection.main.head;
  const active = head >= line.from && head <= line.to ? view.state.field(activeRowIndex) : -1;
  return new RowNumbersMarker(layout.starts[index] ?? line.number, layout.counts[index] ?? 1, active);
}

function spacerFor(view: EditorView): RowNumbersMarker {
  return new RowNumbersMarker(rowLayoutOf(view).total, 1, -1);
}

/** Tracks wrapped screen rows; install once so the status row and jump panel can count them. */
export function rawMarkdownRowLayout(): Extension {
  return [rowLayoutPlugin, activeRowIndex];
}

/** A line-number gutter that numbers every wrapped screen row instead of every source line. */
export function rawMarkdownRowNumbers(): Extension {
  return gutter({
    class: "cm-lineNumbers",
    lineMarker: markerFor,
    lineMarkerChange: (update) =>
      update.selectionSet || update.startState.field(activeRowIndex) !== update.state.field(activeRowIndex),
    initialSpacer: spacerFor,
    updateSpacer: (spacer, update) => {
      const next = spacerFor(update.view);
      return spacer instanceof RowNumbersMarker && spacer.eq(next) ? spacer : next;
    },
  });
}

export function rawMarkdownRowStatus(view: EditorView): RawMarkdownRowStatus {
  const layout = rowLayoutOf(view);
  const lineIndex = view.state.doc.lineAt(view.state.selection.main.head).number - 1;
  return {
    row: rowNumberAt(layout, lineIndex, view.state.field(activeRowIndex, false) ?? 0),
    rowCount: layout.total,
  };
}

/**
 * Moves the cursor to a document-wide row. The line is scrolled into view
 * first because stepping to a row inside it needs that line laid out.
 */
export function jumpToRawMarkdownRow(view: EditorView, row: number): void {
  const { lineIndex, rowIndex } = locateRow(rowLayoutOf(view), row);
  const line = view.state.doc.line(lineIndex + 1);
  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  });
  if (rowIndex === 0) {
    return;
  }
  view.requestMeasure({
    read: (measured) => {
      let range = EditorSelection.cursor(line.from);
      for (let step = 0; step < rowIndex; step += 1) {
        const next = measured.moveVertically(range, true);
        if (next.head > line.to) {
          break;
        }
        range = next;
      }
      return range.head;
    },
    write: (head, measured) => {
      queueMicrotask(() => {
        if (!measured.dom.isConnected) {
          return;
        }
        measured.dispatch({
          selection: { anchor: head },
          effects: EditorView.scrollIntoView(head, { y: "center" }),
        });
      });
    },
  });
}
