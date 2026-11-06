import { InputRule } from "prosemirror-inputrules";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { splitListItem } from "prosemirror-schema-list";
import { type EditorState, Plugin, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { taskCheckItemAttrs } from "../tasks/promotion";
import { checkItemToggle } from "../tasks/recurrence";
import { productSchema } from "./product-schema";
import { isTaskId } from "./tasks";

export function taskInputRule(): InputRule {
  return new InputRule(/^\[([ xX]?)\]\s$/, (state, match, start, end) => {
    const checkList = productSchema.nodes.check_list;
    const checkItem = productSchema.nodes.check_item;
    const bulletList = productSchema.nodes.bullet_list;
    const listItem = productSchema.nodes.list_item;
    if (!checkList || !checkItem || !bulletList || !listItem) return null;
    const $start = state.doc.resolve(start);
    if ($start.parent.type.spec.code || $start.parentOffset !== 0) return null;
    let itemDepth = 0;
    for (let depth = $start.depth; depth > 0; depth -= 1) {
      if ($start.node(depth).type === listItem) {
        itemDepth = depth;
        break;
      }
    }
    if (!itemDepth) return null;
    const item = $start.node(itemDepth);
    const bulletDepth = itemDepth - 1;
    const bullets = $start.node(bulletDepth);
    if (
      item.childCount !== 1 ||
      $start.index(itemDepth) !== 0 ||
      bullets.type !== bulletList ||
      bulletDepth === 0 ||
      $start.node(bulletDepth - 1).type.name !== "doc"
    )
      return null;
    const itemIndex = $start.index(bulletDepth);
    let itemOffset = 0;
    for (let index = 0; index < itemIndex; index += 1) itemOffset += bullets.child(index).nodeSize;
    const bulletPosition = $start.before(bulletDepth);
    const tr = state.tr.delete(start, end);
    const currentBullets = tr.doc.nodeAt(bulletPosition);
    if (!currentBullets || currentBullets.type !== bulletList) return null;
    const currentItem = currentBullets.child(itemIndex);
    const attrs = taskCheckItemAttrs((match[1] ?? "").toLowerCase() === "x");
    const replacement: ProseMirrorNode[] = [];
    if (itemOffset > 0) {
      replacement.push(
        bulletList.create(currentBullets.attrs, currentBullets.content.cut(0, itemOffset)),
      );
    }
    replacement.push(checkList.create(null, checkItem.create(attrs, currentItem.content)));
    if (itemOffset + currentItem.nodeSize < currentBullets.content.size) {
      replacement.push(
        bulletList.create(
          currentBullets.attrs,
          currentBullets.content.cut(itemOffset + currentItem.nodeSize),
        ),
      );
    }
    tr.replaceWith(bulletPosition, bulletPosition + currentBullets.nodeSize, replacement);
    tr.setSelection(TextSelection.near(tr.doc.resolve(bulletPosition + 2), 1));
    return tr.scrollIntoView();
  });
}

function checkboxItemAtDom(view: EditorView, target: HTMLElement): boolean {
  const $pos = view.state.doc.resolve(view.posAtDOM(target, 0));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "check_item") continue;
    const position = $pos.before(depth);
    const restoreFocus = target.ownerDocument.activeElement === target;
    view.dispatch(checkItemToggle(view.state, position, node));
    if (restoreFocus) {
      const item = view.nodeDOM(position);
      if (item instanceof HTMLElement) {
        item.querySelector<HTMLElement>(".check-item-box")?.focus({ preventScroll: true });
      }
    }
    return true;
  }
  return false;
}

export function toggleCheckItemAtSelection(
  state: EditorState,
  dispatch?: (transaction: EditorState["tr"]) => void,
): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "check_item") continue;
    if (dispatch) dispatch(checkItemToggle(state, $from.before(depth), node));
    return true;
  }
  return false;
}

function isCheckbox(target: EventTarget | null): target is HTMLElement {
  return (
    target !== null &&
    typeof target === "object" &&
    "classList" in target &&
    (target as HTMLElement).classList.contains("check-item-box")
  );
}

export function createCheckboxTogglePlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          const target = event.target;
          if (!isCheckbox(target) || !view.editable) {
            return false;
          }
          event.preventDefault();
          return checkboxItemAtDom(view, target);
        },
      },
      handleKeyDown(view, event) {
        if (
          !isCheckbox(event.target) ||
          !view.editable ||
          (event.key !== "Enter" && event.key !== " ")
        ) {
          return false;
        }
        event.preventDefault();
        return checkboxItemAtDom(view, event.target);
      },
    },
  });
}

export function splitTaskItem(checkItem: NonNullable<typeof productSchema.nodes.check_item>) {
  const split = splitListItem(checkItem, { checked: false, taskId: null, blockId: null });
  return (state: EditorState, dispatch?: (transaction: EditorState["tr"]) => void): boolean => {
    const { $from } = state.selection;
    let source: ProseMirrorNode | null = null;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type === checkItem) {
        source = $from.node(depth);
        break;
      }
    }
    const result: { transaction: EditorState["tr"] | null } = { transaction: null };
    if (
      !split(state, (next) => {
        result.transaction = next;
      })
    )
      return false;
    const transaction = result.transaction;
    if (!transaction) return false;
    if (
      source?.textContent.trim() &&
      isTaskId(source.attrs.taskId) &&
      isTaskId(source.attrs.blockId) &&
      source.attrs.taskId !== source.attrs.blockId
    ) {
      const $next = transaction.selection.$from;
      for (let depth = $next.depth; depth > 0; depth -= 1) {
        if ($next.node(depth).type !== checkItem) continue;
        transaction.setNodeMarkup($next.before(depth), undefined, taskCheckItemAttrs(false));
        break;
      }
    }
    if (dispatch) dispatch(transaction);
    return true;
  };
}
