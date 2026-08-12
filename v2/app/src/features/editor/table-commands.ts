import {
  addColumnAfter as addColumnAfterCommand,
  addColumnBefore as addColumnBeforeCommand,
  addRowAfter as addRowAfterCommand,
  addRowBefore as addRowBeforeCommand,
  deleteColumn as deleteColumnCommand,
  deleteRow as deleteRowCommand,
  deleteTable as deleteTableCommand,
  isInTable,
  toggleHeaderRow as toggleHeaderRowCommand,
} from "prosemirror-tables";
import type { Command, EditorState } from "prosemirror-state";

export type TableCommandId =
  | "add-row-before"
  | "add-row-after"
  | "delete-row"
  | "add-column-before"
  | "add-column-after"
  | "delete-column"
  | "toggle-header-row"
  | "delete-table";

export type TableCommand = {
  id: TableCommandId;
  label: string;
  command: Command;
};

function safeTableCommand(command: Command): Command {
  return (state, dispatch, view) => {
    if (!isTableCommandAvailable(state)) return false;
    return command(state, dispatch, view);
  };
}

export function isTableCommandAvailable(state: EditorState): boolean {
  return isInTable(state);
}

export function firstTableCellTextPosition(
  state: EditorState,
  tablePosition: number,
): number | null {
  if (tablePosition < 0 || tablePosition > state.doc.content.size) return null;
  const $table = state.doc.resolve(tablePosition);
  const table = $table.depth === 0 ? $table.nodeAfter : null;
  if (table?.type.spec.tableRole !== "table") return null;
  let textPosition: number | null = null;
  table.descendants((node, position) => {
    if (textPosition !== null) return false;
    if (!node.isTextblock) return true;
    const tableContentStart = tablePosition + 1;
    const textblockContentStart = position + 1;
    textPosition = tableContentStart + textblockContentStart;
    return false;
  });
  return textPosition;
}

export const addRowBefore = safeTableCommand(addRowBeforeCommand);
export const addRowAfter = safeTableCommand(addRowAfterCommand);
export const deleteRow = safeTableCommand(deleteRowCommand);
export const addColumnBefore = safeTableCommand(addColumnBeforeCommand);
export const addColumnAfter = safeTableCommand(addColumnAfterCommand);
export const deleteColumn = safeTableCommand(deleteColumnCommand);
export const toggleHeaderRow = safeTableCommand(toggleHeaderRowCommand);
export const deleteTable = safeTableCommand(deleteTableCommand);

export const tableCommands: readonly TableCommand[] = [
  { id: "add-row-before", label: "Add row above", command: addRowBefore },
  { id: "add-row-after", label: "Add row below", command: addRowAfter },
  { id: "delete-row", label: "Delete row", command: deleteRow },
  { id: "add-column-before", label: "Add column left", command: addColumnBefore },
  { id: "add-column-after", label: "Add column right", command: addColumnAfter },
  { id: "delete-column", label: "Delete column", command: deleteColumn },
  { id: "toggle-header-row", label: "Toggle header row", command: toggleHeaderRow },
  { id: "delete-table", label: "Delete table", command: deleteTable },
];

export function isTableCommandEnabled(state: EditorState, command: TableCommand): boolean {
  return command.command(state);
}
