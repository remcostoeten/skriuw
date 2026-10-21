import { EditorState, type Transaction } from "prosemirror-state";
import { topLevelBlockAtPosition, type BoundedDocument } from "./document/bounded";

export type NoteTarget = {
  readonly state: EditorState;
  dispatch(transaction: Transaction): void;
};

/**
 * @name boundedNoteTarget
 * @description Exposes the whole of a bounded note as one editor state, so a
 * change that has to see or reach blocks outside the mounted window applies to
 * the full document and lands as a single bounded undo entry. The state is
 * built once per call, so ranges read from it stay valid until it is
 * dispatched to. The window moves to the first changed block, so output that
 * lands outside it, such as an AI result appended after the last block, is
 * mounted where the reader can reach it.
 *
 * @example
 * const target = boundedNoteTarget(entry.bounded, () => installBoundedWindow(entry, true));
 * target.dispatch(appendTaskPlanTransaction(target.state, items));
 */
export function boundedNoteTarget(bounded: BoundedDocument, onReplaced: () => void): NoteTarget {
  let state = EditorState.create({ doc: bounded.fullDocument() });
  return {
    get state() {
      return state;
    },
    dispatch(transaction) {
      const previous = state.doc;
      const next = state.apply(transaction);
      state = next;
      if (!transaction.docChanged) return;
      bounded.replaceFullDocument(next.doc, Date.now());
      const changedAt = previous.content.findDiffStart(next.doc.content);
      if (changedAt !== null) bounded.revealBlock(topLevelBlockAtPosition(next.doc, changedAt + 1));
      onReplaced();
    },
  };
}
