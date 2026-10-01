import { InputRule } from "prosemirror-inputrules";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { type EditorState, Plugin, TextSelection, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { todayKey, type DateKey } from "@skriuw/renderer-core/journal/dates";
import { isDueDate } from "@/features/tasks/due-dates";
import {
  formatRecurrenceLabel,
  isRecurrence,
  nextOccurrence,
  resolveRecurrenceExpression,
} from "@/features/tasks/recurrence";

const REPEAT_CHIP_CLASS = "check-item-repeat";

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
 * @name recurrenceChipDom
 * @description The non-editable chip a repeating `check_item` renders after its
 * content, before the due-date chip.
 *
 * @example
 * recurrenceChipDom("every week");
 * // ["span", { class: "check-item-repeat", ... }, "Weekly"]
 */
export function recurrenceChipDom(recurrence: string): [string, Record<string, string>, string] {
  const label = formatRecurrenceLabel(recurrence);
  return [
    "span",
    {
      class: REPEAT_CHIP_CLASS,
      contenteditable: "false",
      role: "button",
      tabindex: "0",
      "aria-label": `Repeats ${recurrence}. Enter edits it, Delete stops it repeating.`,
      title: `Repeats ${recurrence}`,
    },
    label,
  ];
}

/**
 * @name recurrenceInputRule
 * @description Typing `every:<rule>` and a space inside a checklist item's first
 * line lifts the token into the item's recurrence: `every:week`, `every:daily`,
 * `every:weekday`, or a count such as `every:2_weeks`.
 *
 * @example
 * inputRules({ rules: [recurrenceInputRule()] });
 */
export function recurrenceInputRule(): InputRule {
  return new InputRule(/(^|\s)every:(\S+)\s$/i, (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    if ($start.parent.type.name !== "paragraph" || $start.parent.type.spec.code) return null;
    const item = checkItemAround(state, start);
    if (!item || item.node.firstChild !== $start.parent) return null;
    const recurrence = resolveRecurrenceExpression(match[2] ?? "");
    if (recurrence === null) return null;
    const tokenStart = start + (match[1]?.length ?? 0);
    const code = state.schema.marks.code;
    if (code && state.doc.rangeHasMark(tokenStart, end, code)) return null;
    const trimmedStart =
      tokenStart > $start.start() && state.doc.textBetween(tokenStart - 1, tokenStart) === " "
        ? tokenStart - 1
        : tokenStart;
    return state.tr
      .delete(trimmedStart, end)
      .setNodeMarkup(item.position, undefined, { ...item.node.attrs, recurrence });
  });
}

function freshTaskIdentity(): { taskId: string; blockId: string } {
  const taskId = crypto.randomUUID();
  const blockId = crypto.randomUUID();
  if (taskId === blockId) {
    throw new Error("task and block identities must differ");
  }
  return { taskId, blockId };
}

/**
 * @name nextOccurrenceAttrs
 * @description The attributes of the item that replaces a repeating item once
 * it is completed: unchecked, due on the next occurrence counted from its own
 * due date (or from today when it had none), and, for a linked task, a fresh
 * task identity so it becomes a task of its own.
 *
 * @example
 * nextOccurrenceAttrs({ checked: true, recurrence: "every week", dueDate: "2026-10-01", taskId: null, blockId: null });
 * // { checked: false, recurrence: "every week", dueDate: "2026-10-08", taskId: null, blockId: null }
 */
export function nextOccurrenceAttrs(
  attrs: Record<string, unknown>,
  today: DateKey = todayKey(),
): Record<string, unknown> | null {
  const recurrence = attrs.recurrence;
  if (!isRecurrence(recurrence)) return null;
  const anchor = isDueDate(attrs.dueDate) ? attrs.dueDate : today;
  const dueDate = nextOccurrence(recurrence, anchor);
  if (dueDate === null) return null;
  const linked = typeof attrs.taskId === "string" && attrs.taskId.length > 0;
  return {
    ...attrs,
    checked: false,
    dueDate,
    recurrence,
    ...(linked ? freshTaskIdentity() : { taskId: null, blockId: null }),
  };
}

/**
 * @name checkItemToggle
 * @description Flips one checklist item. Completing a repeating item also
 * inserts its next occurrence directly below it, in the same transaction, so
 * one undo removes both.
 *
 * @example
 * view.dispatch(checkItemToggle(view.state, position, node));
 */
export function checkItemToggle(
  state: EditorState,
  position: number,
  node: ProseMirrorNode,
  today: DateKey = todayKey(),
): Transaction {
  const completing = node.attrs.checked !== true;
  const transaction = state.tr.setNodeMarkup(position, undefined, {
    ...node.attrs,
    checked: completing,
  });
  const attrs = completing ? nextOccurrenceAttrs(node.attrs, today) : null;
  const line = node.firstChild;
  if (attrs === null || line === null) return transaction;
  const next = node.type.create(attrs, line.copy(line.content));
  return transaction.insert(position + node.nodeSize, next);
}

function isRepeatChip(target: EventTarget | null): target is HTMLElement {
  return (
    target !== null &&
    typeof target === "object" &&
    "classList" in target &&
    (target as HTMLElement).classList.contains(REPEAT_CHIP_CLASS)
  );
}

function clearAtChip(view: EditorView, chip: HTMLElement): boolean {
  const item = checkItemAround(view.state, view.posAtDOM(chip, 0));
  if (!item) return false;
  view.dispatch(
    view.state.tr.setNodeMarkup(item.position, undefined, { ...item.node.attrs, recurrence: null }),
  );
  const dom = view.nodeDOM(item.position);
  if (dom instanceof HTMLElement) {
    dom.querySelector<HTMLElement>(".check-item-box")?.focus({ preventScroll: true });
  }
  return true;
}

function editAtChip(view: EditorView, chip: HTMLElement): boolean {
  const item = checkItemAround(view.state, view.posAtDOM(chip, 0));
  const recurrence = item?.node.attrs.recurrence;
  const line = item?.node.firstChild;
  if (!item || !isRecurrence(recurrence) || line?.type.name !== "paragraph") return false;
  const lineEnd = item.position + 1 + line.nodeSize - 1;
  const separator = line.textContent.length > 0 && !/\s$/.test(line.textContent) ? " " : "";
  const token = recurrence.slice("every ".length).replaceAll(" ", "_");
  const transaction = view.state.tr
    .setNodeMarkup(item.position, undefined, { ...item.node.attrs, recurrence: null })
    .insertText(`${separator}every:${token}`, lineEnd);
  const cursor = transaction.mapping.map(lineEnd, 1);
  view.dispatch(transaction.setSelection(TextSelection.create(transaction.doc, cursor)));
  view.focus();
  return true;
}

/**
 * @name createRecurrenceChipPlugin
 * @description Makes the recurrence chip operable: a click or Enter turns it
 * back into an editable `every:` token, Delete or Backspace stops the repeat.
 *
 * @example
 * new EditorState({ schema, plugins: [createRecurrenceChipPlugin()] });
 */
export function createRecurrenceChipPlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          if (!isRepeatChip(event.target) || !view.editable) return false;
          event.preventDefault();
          return editAtChip(view, event.target);
        },
      },
      handleKeyDown(view, event) {
        if (!isRepeatChip(event.target) || !view.editable) return false;
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
