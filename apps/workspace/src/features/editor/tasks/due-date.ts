import { InputRule } from "prosemirror-inputrules";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { type EditorState, Plugin, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { todayKey, type DateKey } from "@skriuw/renderer-core/journal/dates";
import {
  describeDueDate,
  dueBucket,
  formatDueLabel,
  isDueDate,
  resolveDueExpression,
} from "@/features/tasks/due-dates";

const DUE_CHIP_CLASS = "check-item-due";

type CheckItemAt = { node: ProseMirrorNode; position: number };

function checkItemAround(state: EditorState, position: number): CheckItemAt | null {
  const $position = state.doc.resolve(position);
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const node = $position.node(depth);
    if (node.type.name === "check_item") {
      return { node, position: $position.before(depth) };
    }
  }
  return null;
}

/**
 * @name dueDateChipDom
 * @description The non-editable chip a dated `check_item` renders after its
 * content. Its label is relative to the day it was rendered on.
 *
 * @example
 * const chip = dueDateChipDom("2026-10-01", false);
 * // ["span", { class: "check-item-due", ... }, "Tomorrow"]
 */
export function dueDateChipDom(
  dueDate: DateKey,
  checked: boolean,
  today: DateKey = todayKey(),
): [string, Record<string, string>, string] {
  return [
    "span",
    {
      class: DUE_CHIP_CLASS,
      contenteditable: "false",
      role: "button",
      tabindex: "0",
      "data-due-state": dueBucket(dueDate, checked, today),
      "aria-label": `${describeDueDate(dueDate, checked, today)}. Enter edits it, Delete clears it.`,
      title: describeDueDate(dueDate, checked, today),
    },
    formatDueLabel(dueDate, today),
  ];
}

/**
 * @name dueDateInputRule
 * @description Typing `due:<date>` and a space inside a checklist item's first
 * line lifts the token into the item's due date. The date accepts `YYYY-MM-DD`,
 * weekday names, and the journal's forgiving grammar with `_` for spaces.
 *
 * @example
 * inputRules({ rules: [dueDateInputRule()] });
 */
export function dueDateInputRule(today: () => DateKey = todayKey): InputRule {
  return new InputRule(/(^|\s)due:(\S+)\s$/i, (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    if ($start.parent.type.name !== "paragraph" || $start.parent.type.spec.code) return null;
    const item = checkItemAround(state, start);
    if (!item || item.node.firstChild !== $start.parent) return null;
    const dueDate = resolveDueExpression(match[2] ?? "", today());
    if (dueDate === null) return null;
    const tokenStart = start + (match[1]?.length ?? 0);
    const code = state.schema.marks.code;
    if (code && state.doc.rangeHasMark(tokenStart, end, code)) return null;
    const trimmedStart =
      tokenStart > $start.start() && state.doc.textBetween(tokenStart - 1, tokenStart) === " "
        ? tokenStart - 1
        : tokenStart;
    return state.tr
      .delete(trimmedStart, end)
      .setNodeMarkup(item.position, undefined, { ...item.node.attrs, dueDate });
  });
}

function isDueChip(target: EventTarget | null): target is HTMLElement {
  return (
    target !== null &&
    typeof target === "object" &&
    "classList" in target &&
    (target as HTMLElement).classList.contains(DUE_CHIP_CLASS)
  );
}

function focusCheckItemBox(view: EditorView, position: number): void {
  const dom = view.nodeDOM(position);
  if (dom instanceof HTMLElement) {
    dom.querySelector<HTMLElement>(".check-item-box")?.focus({ preventScroll: true });
  }
}

function clearAtChip(view: EditorView, chip: HTMLElement): boolean {
  const item = checkItemAround(view.state, view.posAtDOM(chip, 0));
  if (!item) return false;
  view.dispatch(
    view.state.tr.setNodeMarkup(item.position, undefined, { ...item.node.attrs, dueDate: null }),
  );
  focusCheckItemBox(view, item.position);
  return true;
}

/**
 * Editing turns the chip back into the `due:` token at the end of the line, so
 * the same keyboard path that set the date changes it: edit, then type a space.
 */
function editAtChip(view: EditorView, chip: HTMLElement): boolean {
  const item = checkItemAround(view.state, view.posAtDOM(chip, 0));
  const dueDate = item?.node.attrs.dueDate;
  const line = item?.node.firstChild;
  if (!item || !isDueDate(dueDate) || line?.type.name !== "paragraph") return false;
  const lineEnd = item.position + 1 + line.nodeSize - 1;
  const separator = line.textContent.length > 0 && !/\s$/.test(line.textContent) ? " " : "";
  const transaction = view.state.tr
    .setNodeMarkup(item.position, undefined, { ...item.node.attrs, dueDate: null })
    .insertText(`${separator}due:${dueDate}`, lineEnd);
  const cursor = transaction.mapping.map(lineEnd, 1);
  view.dispatch(transaction.setSelection(TextSelection.create(transaction.doc, cursor)));
  view.focus();
  return true;
}

/**
 * @name createDueDateChipPlugin
 * @description Makes the due-date chip operable: a click or Enter turns it back
 * into an editable `due:` token, Delete or Backspace clears it.
 *
 * @example
 * new EditorState({ schema, plugins: [createDueDateChipPlugin()] });
 */
export function createDueDateChipPlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          if (!isDueChip(event.target) || !view.editable) return false;
          event.preventDefault();
          return editAtChip(view, event.target);
        },
      },
      handleKeyDown(view, event) {
        if (!isDueChip(event.target) || !view.editable) return false;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          return editAtChip(view, event.target);
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          return clearAtChip(view, event.target);
        }
        return false;
      },
    },
  });
}
