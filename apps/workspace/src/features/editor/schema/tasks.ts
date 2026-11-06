import { isDueDate } from "@skriuw/renderer-core/tasks/due-dates";
import { isRecurrence } from "@skriuw/renderer-core/tasks/recurrence";
import type { DOMOutputSpec, NodeSpec } from "prosemirror-model";
import { dueDateChipDom } from "../tasks/due-date";
import { recurrenceChipDom } from "../tasks/recurrence";

export const checkListSpec: NodeSpec = {
  content: "check_item+",
  group: "block",
  toDOM: () => ["ul", { class: "check-list", "data-check-list": "true" }, 0],
  parseDOM: [{ tag: "ul[data-check-list]", priority: 60 }],
};

let checkboxDomId = 0;

export const checkItemSpec: NodeSpec = {
  content: "paragraph block*",
  defining: true,
  attrs: {
    checked: { default: false },
    taskId: { default: null },
    blockId: { default: null },
    dueDate: { default: null },
    recurrence: { default: null },
  },
  toDOM: (node) => {
    const contentId = `check-item-content-${++checkboxDomId}`;
    const dueDate: unknown = node.attrs.dueDate;
    const recurrence: unknown = node.attrs.recurrence;
    const content: DOMOutputSpec = ["div", { class: "check-item-content", id: contentId }, 0];
    return [
      "li",
      {
        class: "check-item",
        "data-checked": node.attrs.checked ? "true" : "false",
        ...(node.attrs.taskId ? { "data-task-id": String(node.attrs.taskId) } : {}),
        ...(node.attrs.blockId ? { "data-block-id": String(node.attrs.blockId) } : {}),
        ...(isDueDate(dueDate) ? { "data-due-date": dueDate } : {}),
        ...(isRecurrence(recurrence) ? { "data-recurrence": recurrence } : {}),
      },
      [
        "span",
        {
          class: "check-item-box",
          contenteditable: "false",
          role: "checkbox",
          "aria-labelledby": contentId,
          "aria-checked": node.attrs.checked ? "true" : "false",
          tabindex: "0",
          "aria-keyshortcuts": "Alt+Shift+Enter",
        },
      ],
      content,
      ...(isRecurrence(recurrence) ? [recurrenceChipDom(recurrence)] : []),
      ...(isDueDate(dueDate) ? [dueDateChipDom(dueDate, node.attrs.checked === true)] : []),
    ];
  },
  parseDOM: [
    {
      tag: "li[data-checked]",
      priority: 60,
      contentElement: (dom) =>
        dom.querySelector<HTMLElement>(":scope > .check-item-content") ?? dom,
      getAttrs: (dom) => {
        const dueDate = dom.getAttribute("data-due-date");
        const recurrence = dom.getAttribute("data-recurrence");
        return {
          checked: dom.getAttribute("data-checked") === "true",
          taskId: dom.getAttribute("data-task-id"),
          blockId: dom.getAttribute("data-block-id"),
          dueDate: isDueDate(dueDate) ? dueDate : null,
          recurrence: isRecurrence(recurrence) ? recurrence : null,
        };
      },
    },
  ],
};

export function isTaskId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
