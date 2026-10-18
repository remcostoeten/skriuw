import { databaseScopeStatus } from "@skriuw/renderer-core/database/rows";
import { databaseHash } from "@skriuw/renderer-core/route/app-route";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import type { AppCommand } from "@/commands/registry";
import { focusedFolderId } from "@/features/notes/focus";
import { DatabaseIcon, TableIcon } from "@/shared/icons/static";

/**
 * The folder a "this folder" command means: the one focused in the sidebar,
 * or else the folder holding the open note.
 */
export function databaseTargetFolder(state: RendererState): string | null {
  const noteId = state.activeNoteId;
  const folderId =
    focusedFolderId(state) ??
    (noteId === null ? null : (state.nodes.get(noteId)?.parentId ?? null));
  return folderId !== null && databaseScopeStatus(state, folderId) === "ready" ? folderId : null;
}

export function databaseCommands(store: RendererStore): AppCommand[] {
  return [
    {
      id: "open-folder-database",
      label: "Open folder as database",
      group: "Navigation",
      keywords: ["database", "table", "board", "kanban", "properties", "folder"],
      icon: <TableIcon size={15} />,
      visible: (state) => databaseTargetFolder(state) !== null,
      run: () => {
        const folderId = databaseTargetFolder(store.getState());
        if (folderId !== null) window.location.hash = databaseHash(folderId);
      },
    },
    {
      id: "open-workspace-database",
      label: "Open all notes as database",
      group: "Navigation",
      keywords: ["database", "table", "board", "kanban", "properties", "all notes"],
      icon: <DatabaseIcon size={15} />,
      run: () => {
        window.location.hash = databaseHash(null);
      },
    },
  ];
}
