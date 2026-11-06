import { InputRule } from "prosemirror-inputrules";
import { wrapRangeInList } from "prosemirror-schema-list";
import { type EditorState, TextSelection, type Transaction } from "prosemirror-state";
import { findWrapping } from "prosemirror-transform";
import { productSchema } from "./product-schema";

function isolateCursorLine(transaction: Transaction): Transaction {
  const hardBreak = productSchema.nodes.hard_break;
  const { $from, $to } = transaction.selection;
  if (!hardBreak || $from.parent.type !== productSchema.nodes.paragraph || !$from.sameParent($to)) {
    return transaction;
  }
  const contentStart = $from.start();
  let before: number | null = null;
  let after: number | null = null;
  let position = contentStart;
  for (let index = 0; index < $from.parent.childCount; index += 1) {
    const child = $from.parent.child(index);
    if (child.type === hardBreak) {
      if (position < $from.pos) before = position;
      else if (after === null && position >= $to.pos) after = position;
    }
    position += child.nodeSize;
  }
  if (before === null && after === null) return transaction;
  const lineStart = before === null ? contentStart : before + 1;
  if (after !== null) transaction.delete(after, after + 1).split(after);
  if (before !== null) transaction.delete(before, before + 1).split(before);
  const isolatedStart = before === null ? contentStart : before + 2;
  return transaction.setSelection(
    TextSelection.create(
      transaction.doc,
      isolatedStart + ($from.pos - lineStart),
      isolatedStart + ($to.pos - lineStart),
    ),
  );
}

/**
 * @name wrapLineInCheckList
 * @description Turns the line under the cursor into a check-list item. Only
 * that visual line moves into the task, so the checkbox and the text it
 * belongs to share one row even when the paragraph holds several lines.
 *
 * @example
 * wrapLineInCheckList(view.state, view.dispatch);
 */
export function wrapLineInCheckList(
  state: EditorState,
  dispatch?: (transaction: Transaction) => void,
): boolean {
  const checkList = productSchema.nodes.check_list;
  if (!checkList) return false;
  const transaction = isolateCursorLine(state.tr);
  const range = transaction.selection.$from.blockRange(transaction.selection.$to);
  if (!range || !wrapRangeInList(dispatch ? transaction : null, range, checkList)) return false;
  if (dispatch) dispatch(transaction.scrollIntoView());
  return true;
}

export function checkListInputRule(): InputRule {
  // Matches `[ ]`, `[x]` or `[]` plus a space at the start of a paragraph or right after a line break (U+FFFC).
  return new InputRule(/(?<=^|\ufffc)\s*\[([ xX])?\]\s$/, (state, match, start, end) => {
    const checkList = productSchema.nodes.check_list;
    if (!checkList) return null;
    const $start = state.doc.resolve(start);
    if ($start.parent.type.spec.code) return null;
    if ($start.parentOffset > 0 && $start.nodeBefore?.type !== productSchema.nodes.hard_break) {
      return null;
    }
    const tr = isolateCursorLine(state.tr.delete(start, end));
    const range = tr.selection.$from.blockRange();
    if (!range) return null;
    const wrapping = findWrapping(range, checkList);
    if (!wrapping) return null;
    tr.wrap(range, wrapping);
    if ((match[1] ?? "").toLowerCase() === "x") {
      tr.setNodeMarkup(range.start + 1, undefined, { checked: true });
    }
    return tr;
  });
}
