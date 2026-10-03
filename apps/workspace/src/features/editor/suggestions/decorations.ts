import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

/**
 * A proposed replacement for a document range, painted over the note without
 * touching it. The document is never a draft target: the range keeps its real
 * text and only gains a decoration, and the proposal itself is shown by the
 * caller outside the document. Dismissing therefore restores nothing, because
 * nothing was written.
 */
export type SuggestionPreview = {
  /** Identifies the review session, so redrawing one is not dismissing it. */
  key: string;
  from: number;
  to: number;
  /** Held back until the text stops growing, so the range is not struck early. */
  settled: boolean;
  /** Fired once when the preview leaves the editor, however it left. */
  onDismiss: () => void;
};

type SuggestionState = {
  preview: SuggestionPreview | null;
};

export const suggestionPluginKey = new PluginKey<SuggestionState>("skriuw-suggestion");

const PENDING_CLASS = "skriuw-suggestion-range";
const SETTLED_CLASS = "skriuw-suggestion-range skriuw-suggestion-range--settled";

function buildDecorations(state: EditorState, preview: SuggestionPreview | null): DecorationSet {
  if (preview === null || preview.to <= preview.from) {
    return DecorationSet.empty;
  }
  if (preview.from < 0 || preview.to > state.doc.content.size) {
    return DecorationSet.empty;
  }
  return DecorationSet.create(state.doc, [
    Decoration.inline(preview.from, preview.to, {
      class: preview.settled ? SETTLED_CLASS : PENDING_CLASS,
    }),
  ]);
}

/**
 * Nothing is mapped through `tr.mapping`: an edit invalidates the range the
 * result was produced from, and a proposal rewritten against text the writer
 * has since changed would be a different proposal. Editing dismisses it.
 */
export function createSuggestionPlugin(): Plugin<SuggestionState> {
  return new Plugin<SuggestionState>({
    key: suggestionPluginKey,
    state: {
      init() {
        return { preview: null };
      },
      apply(tr, previous) {
        const meta = tr.getMeta(suggestionPluginKey) as
          | { preview: SuggestionPreview | null }
          | undefined;
        if (meta !== undefined) {
          return { preview: meta.preview };
        }
        if (tr.docChanged && previous.preview !== null) {
          return { preview: null };
        }
        return previous;
      },
    },
    props: {
      decorations(state) {
        const plugin = suggestionPluginKey.getState(state);
        return buildDecorations(state, plugin?.preview ?? null);
      },
    },
    view() {
      return {
        update(view, previousState) {
          const before = suggestionPluginKey.getState(previousState)?.preview ?? null;
          const after = suggestionPluginKey.getState(view.state)?.preview ?? null;
          if (before !== null && before.key !== after?.key) {
            before.onDismiss();
          }
        },
      };
    },
  });
}

export type SuggestionTarget = {
  readonly state: EditorState;
  dispatch(transaction: Transaction): void;
};

/**
 * Shows or clears the proposal. Never joins the undo stack: reviewing a
 * suggestion is not an edit, and undo must not step back through it.
 */
export function setSuggestionPreview(
  view: SuggestionTarget,
  preview: SuggestionPreview | null,
): void {
  const current = suggestionPluginKey.getState(view.state)?.preview ?? null;
  if (current === preview) {
    return;
  }
  const tr = view.state.tr.setMeta(suggestionPluginKey, { preview });
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}
