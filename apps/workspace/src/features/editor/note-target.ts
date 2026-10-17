import { EditorState, type Transaction } from "prosemirror-state";
import type { BoundedDocument } from "./document/bounded";

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
 * dispatched to.
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
      const next = state.apply(transaction);
      state = next;
      if (!transaction.docChanged) return;
      bounded.replaceFullDocument(next.doc, Date.now());
      onReplaced();
    },
  };
}
