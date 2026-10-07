import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { shortcutDefinition } from "@/commands/bindings";
import { onRoute, type AppCommand } from "@/commands/registry";
import { targetNoteId } from "@/features/notes/target-note";
import { createFolder, createNote, setNodePinned } from "@/features/notes/operations";
import {
  duplicateCurrentNote,
  restoreTrashedNote,
  trashCurrentNote,
} from "@/features/notes/current-note";
import {
  describeEmptyNoteCount,
  restoreEmptyNotes,
  trashEmptyNotes,
} from "@/features/notes/empty-notes";
import { focusedPaneNoteId } from "@/features/notes/navigation";
import { renameCurrentNote } from "@/features/sidebar/tree-state";
import {
  CopyIcon,
  EraserIcon,
  FolderPlusIcon,
  NewNoteIcon,
  PencilIcon,
  PinIcon,
  Trash2Icon,
} from "@/shared/icons/static";
import { showToast } from "@/shared/ui/toast";
import { captureRenameReturnFocus } from "./rename-focus";

const onNotesRoute = onRoute("notes");

export function sidebarCommands(store: RendererStore, openSidebar: () => void): AppCommand[] {
  return [
    {
      id: "new-note",
      label: "New note",
      group: "Actions",
      keywords: ["create"],
      icon: <NewNoteIcon size={15} />,
      shortcut: "createNote",
      enabled: onNotesRoute,
      run: () => createNote(store, null),
    },
    {
      id: "new-folder",
      label: "New folder",
      group: "Actions",
      keywords: ["create"],
      icon: <FolderPlusIcon size={15} />,
      shortcut: "createFolder",
      enabled: onNotesRoute,
      run: () => createFolder(store, null),
    },
    {
      id: "toggle-pin-note",
      label: "Pin or unpin current note",
      group: "Actions",
      keywords: ["pin", "unpin", "favorite", "shelf"],
      icon: <PinIcon size={15} />,
      shortcut: "togglePinNote",
      enabled: (state) => targetNoteId(state) !== null,
      run: () => {
        const state = store.getState();
        const noteId = targetNoteId(state);
        if (!noteId) {
          return;
        }
        const pinned = (state.sourceNodes.get(noteId)?.pinnedAt ?? null) !== null;
        setNodePinned(store, noteId, !pinned);
      },
    },
    {
      id: "rename-current-note",
      label: "Rename current note",
      group: "Actions",
      keywords: ["rename", "title", "name"],
      icon: <PencilIcon size={15} />,
      shortcut: "renameCurrentNote",
      enabled: (state, ui) => onNotesRoute(state, ui) && focusedPaneNoteId(state) !== null,
      run: () => {
        openSidebar();
        captureRenameReturnFocus();
        renameCurrentNote(store);
      },
    },
    {
      id: "duplicate-current-note",
      label: "Duplicate current note",
      group: "Actions",
      keywords: ["duplicate", "copy", "clone"],
      icon: <CopyIcon size={15} />,
      shortcut: "duplicateCurrentNote",
      hint: shortcutDefinition("duplicateCurrentNote").description,
      enabled: (state, ui) => onNotesRoute(state, ui) && targetNoteId(state) !== null,
      run: () => {
        captureRenameReturnFocus();
        void duplicateCurrentNote(store, targetNoteId(store.getState())).then((duplicated) => {
          if (duplicated === null) {
            return;
          }
          openSidebar();
          renameCurrentNote(store);
        });
      },
    },
    {
      id: "trash-current-note",
      label: "Move current note to trash",
      group: "Actions",
      keywords: ["trash", "delete", "remove"],
      icon: <Trash2Icon size={15} />,
      shortcut: "trashCurrentNote",
      hint: shortcutDefinition("trashCurrentNote").description,
      enabled: (state, ui) => onNotesRoute(state, ui) && focusedPaneNoteId(state) !== null,
      run: () => {
        void trashCurrentNote(store).then((trashed) => {
          if (trashed === null) {
            return;
          }
          showToast({
            message: `Moved “${trashed.title}” to trash`,
            action: {
              label: "Undo",
              run: () => restoreTrashedNote(store, trashed.noteId),
            },
          });
        });
      },
    },
    {
      id: "trash-empty-notes",
      label: "Clean up empty notes",
      group: "Actions",
      keywords: ["empty", "blank", "untitled", "cleanup", "trash", "delete", "remove", "bulk"],
      icon: <EraserIcon size={15} />,
      hint: "Move every note without content to the trash in one go.",
      run: () => {
        void trashEmptyNotes(store).then((cleanup) => {
          if (cleanup.noteIds.length === 0) {
            showToast({ message: "No empty notes to clean up" });
            return;
          }
          showToast({
            message: `Moved ${describeEmptyNoteCount(cleanup.noteIds.length)} to trash`,
            action: { label: "Undo", run: () => restoreEmptyNotes(store, cleanup) },
          });
        });
      },
    },
  ];
}
