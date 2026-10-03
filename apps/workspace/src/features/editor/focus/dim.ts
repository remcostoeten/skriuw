import type { Node as ProseMirrorNode, ResolvedPos } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

export const FOCUS_CARET_BLOCK_CLASS = "focus-caret-block";

export type BlockRange = { from: number; to: number };

const focusDimKey = new PluginKey("focus-dim");

/**
 * @name caretBlockRange
 * @description The top-level block that holds the caret, as a document
 * range. A selection between blocks, such as a selected image, resolves to
 * the block right after it. Null for an empty document.
 *
 * @example
 * const range = caretBlockRange(state.doc, state.selection.$from);
 */
export function caretBlockRange(doc: ProseMirrorNode, $from: ResolvedPos): BlockRange | null {
  if ($from.depth === 0) {
    const node = $from.nodeAfter ?? $from.nodeBefore;
    if (node === null) {
      return null;
    }
    const from = $from.nodeAfter ? $from.pos : $from.pos - node.nodeSize;
    return { from, to: from + node.nodeSize };
  }
  const from = $from.before(1);
  return { from, to: from + doc.child($from.index(0)).nodeSize };
}

/**
 * @name createFocusDimPlugin
 * @description Marks the top-level block holding the caret so focus mode can
 * dim every other paragraph through CSS. It adds one node decoration and
 * reuses it while the caret stays in the same block of the same document.
 *
 * @example
 * createFocusDimPlugin(() => dimsFocusParagraphs(store.getState().settings));
 */
export function createFocusDimPlugin(enabled: () => boolean): Plugin {
  let cachedDoc: ProseMirrorNode | null = null;
  let cachedFrom = -1;
  let cachedSet = DecorationSet.empty;
  return new Plugin({
    key: focusDimKey,
    props: {
      decorations: (state) => {
        if (!enabled()) {
          return null;
        }
        const range = caretBlockRange(state.doc, state.selection.$from);
        if (range === null) {
          return null;
        }
        if (cachedDoc !== state.doc || cachedFrom !== range.from) {
          cachedDoc = state.doc;
          cachedFrom = range.from;
          cachedSet = DecorationSet.create(state.doc, [
            Decoration.node(range.from, range.to, { class: FOCUS_CARET_BLOCK_CLASS }),
          ]);
        }
        return cachedSet;
      },
    },
  });
}

/**
 * @name refreshFocusDim
 * @description Redraws decorations after the dimming setting changed, without
 * touching the document or the undo history.
 *
 * @example
 * useEffect(() => refreshFocusDim(view), [dimParagraphs]);
 */
export function refreshFocusDim(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(focusDimKey, true).setMeta("addToHistory", false));
}
