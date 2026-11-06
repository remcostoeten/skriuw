import { InputRule } from "prosemirror-inputrules";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { type EditorState, Plugin, TextSelection } from "prosemirror-state";
import { findWrapping } from "prosemirror-transform";
import type { EditorView } from "prosemirror-view";
import { productSchema } from "./product-schema";

export function toggleListInputRule(): InputRule {
  return new InputRule(/^\s*\[([>vV])\]\s$/, (state, match, start, end) => {
    const toggleList = productSchema.nodes.toggle_list;
    if (!toggleList) return null;
    if (state.doc.resolve(start).parent.type.spec.code) return null;
    const tr = state.tr.delete(start, end);
    const range = tr.doc.resolve(start).blockRange();
    if (!range) return null;
    const wrapping = findWrapping(range, toggleList);
    if (!wrapping) return null;
    tr.wrap(range, wrapping);
    tr.setNodeMarkup(range.start + 1, undefined, {
      open: (match[1] ?? "").toLowerCase() === "v",
    });
    return tr;
  });
}

function toggleItemAtDom(view: EditorView, target: HTMLElement): boolean {
  const $pos = view.state.doc.resolve(view.posAtDOM(target, 0));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "toggle_item") continue;
    view.dispatch(toggleItemTransaction(view.state, $pos.before(depth), node));
    return true;
  }
  return false;
}

function toggleItemTransaction(
  state: EditorState,
  position: number,
  node: ProseMirrorNode,
): EditorState["tr"] {
  const closing = node.attrs.open !== false;
  const transaction = state.tr.setNodeMarkup(position, undefined, {
    open: !closing,
  });
  const summary = node.firstChild;
  if (
    closing &&
    summary &&
    state.selection.from > position &&
    state.selection.to > position + summary.nodeSize &&
    state.selection.to < position + node.nodeSize
  ) {
    transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(position + summary.nodeSize), -1),
    );
  }
  return transaction;
}

function isToggleDisclosure(target: EventTarget | null): target is HTMLElement {
  return (
    target !== null &&
    typeof target === "object" &&
    "classList" in target &&
    (target as HTMLElement).classList.contains("toggle-item-disclosure")
  );
}

export function toggleItemAtSelection(
  state: EditorState,
  dispatch?: (transaction: EditorState["tr"]) => void,
): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "toggle_item") continue;
    if (dispatch) {
      dispatch(toggleItemTransaction(state, $from.before(depth), node));
    }
    return true;
  }
  return false;
}

export function createToggleListPlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        click(view, event) {
          const target = event.target;
          if (!isToggleDisclosure(target) || !view.editable) {
            return false;
          }
          event.preventDefault();
          return toggleItemAtDom(view, target);
        },
      },
      handleKeyDown(view, event) {
        const target = event.target;
        if (
          !isToggleDisclosure(target) ||
          !view.editable ||
          (event.key !== "Enter" && event.key !== " ")
        ) {
          return false;
        }
        event.preventDefault();
        return toggleItemAtDom(view, target);
      },
    },
  });
}
