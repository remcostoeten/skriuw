import type { Node as ProseMirrorNode } from "prosemirror-model";
import { type Command, type EditorState, type Transaction } from "prosemirror-state";
import { wrapInList } from "prosemirror-schema-list";
import { productSchema } from "./schema";

export type ChecklistTaskLink = {
  taskId: string;
  sourceNoteId: string;
  sourceBlockId: string;
  title: string;
  status: "todo" | "done";
  updatedAt: number;
};

export type ChecklistTaskPromotion = {
  link: ChecklistTaskLink;
  transaction: Transaction;
};

type PromotionInput = {
  noteId: string;
  taskId: string;
  sourceBlockId: string;
  at: number;
};

function validId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function taskCheckItemAttrs(checked = false): {
  checked: boolean;
  taskId: string;
  blockId: string;
} {
  const taskId = crypto.randomUUID();
  const blockId = crypto.randomUUID();
  if (taskId === blockId) {
    throw new Error("task and block identities must differ");
  }
  return { checked, taskId, blockId };
}

/** Wrap the current block as a linked task, keeping slash commands out of schema code. */
export const insertTask: Command = (state, dispatch) => {
  const checkList = productSchema.nodes.check_list;
  const checkItem = productSchema.nodes.check_item;
  if (!checkList || !checkItem) return false;
  const result: { transaction: Transaction | null } = { transaction: null };
  if (!wrapInList(checkList)(state, (transaction) => { result.transaction = transaction; })) return false;
  const wrapped = result.transaction;
  if (!wrapped) return false;
  const $from = wrapped.selection.$from;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type !== checkItem) continue;
    const position = $from.before(depth);
    const transaction = wrapped.setNodeMarkup(position, undefined, taskCheckItemAttrs());
    if (dispatch) dispatch(transaction.scrollIntoView());
    return true;
  }
  return false;
};

function checklistTaskTitle(node: ProseMirrorNode): string {
  return node.firstChild?.type.name === "paragraph"
    ? node.firstChild.textContent.trim()
    : "";
}

export function promoteSelectedChecklistItem(
  state: EditorState,
  input: PromotionInput,
): ChecklistTaskPromotion | null {
  if (
    !validId(input.noteId) ||
    !validId(input.taskId) ||
    !validId(input.sourceBlockId) ||
    input.taskId === input.sourceBlockId ||
    input.at < 0
  ) {
    return null;
  }
  for (let depth = state.selection.$from.depth; depth > 0; depth -= 1) {
    const node = state.selection.$from.node(depth);
    if (node.type.name !== "check_item") {
      continue;
    }
    if (typeof node.attrs.taskId === "string" && node.attrs.taskId.length > 0) {
      return null;
    }
    const title = checklistTaskTitle(node);
    if (!title) {
      return null;
    }
    const position = state.selection.$from.before(depth);
    return {
      link: {
        taskId: input.taskId,
        sourceNoteId: input.noteId,
        sourceBlockId: input.sourceBlockId,
        title,
        status: node.attrs.checked ? "done" : "todo",
        updatedAt: input.at,
      },
      transaction: state.tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        taskId: input.taskId,
        blockId: input.sourceBlockId,
      }),
    };
  }
  return null;
}

export function promotedChecklistTaskLinks(
  document: ProseMirrorNode,
  noteId: string,
  at: number,
): ChecklistTaskLink[] {
  if (!validId(noteId) || at < 0) {
    return [];
  }
  const links: ChecklistTaskLink[] = [];
  document.descendants((node) => {
    const taskId = node.attrs.taskId;
    const sourceBlockId = node.attrs.blockId;
    if (
      node.type.name !== "check_item" ||
      typeof taskId !== "string" ||
      typeof sourceBlockId !== "string" ||
      !validId(taskId) ||
      !validId(sourceBlockId) ||
      taskId === sourceBlockId
    ) {
      return;
    }
    const title = checklistTaskTitle(node);
    if (!title) {
      return;
    }
    links.push({
      taskId,
      sourceNoteId: noteId,
      sourceBlockId,
      title,
      status: node.attrs.checked ? "done" : "todo",
      updatedAt: at,
    });
  });
  return links;
}
