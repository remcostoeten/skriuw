import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { AppCommand } from "@/commands/registry";
import { targetNoteId } from "@/features/notes/target-note";
import { LockIcon, LockOpenIcon } from "@/shared/icons/static";
import { showToast } from "@/shared/ui/toast";
import { relockNotes, requestSessionUnlock, toggleNodeLock } from "./lock";

export function lockCommands(store: RendererStore): AppCommand[] {
  return [
    {
      id: "toggle-lock-note",
      label: "Lock or unlock current note",
      group: "Actions",
      keywords: ["lock", "unlock", "pin code", "passcode", "private", "protect", "encrypt"],
      icon: <LockIcon size={15} />,
      shortcut: "toggleLockNote",
      enabled: (state) => targetNoteId(state) !== null,
      run: () => {
        const noteId = targetNoteId(store.getState());
        if (noteId) {
          toggleNodeLock(store, noteId);
        }
      },
    },
    {
      id: "lock-notes-now",
      label: "Lock notes now",
      group: "Actions",
      keywords: ["lock", "relock", "close locked notes", "privacy"],
      icon: <LockIcon size={15} />,
      shortcut: "lockNotesNow",
      visible: (state) => state.noteLock?.configured === true,
      enabled: (state) => state.noteLock?.unlocked === true,
      run: () => {
        void relockNotes(store)
          .then(() => showToast({ message: "Notes locked" }))
          .catch((error: unknown) => showToast({ message: `Locking failed. ${String(error)}` }));
      },
    },
    {
      id: "unlock-notes",
      label: "Unlock notes…",
      group: "Actions",
      keywords: ["unlock", "pin", "passphrase", "locked notes"],
      icon: <LockOpenIcon size={15} />,
      visible: (state) => state.noteLock?.configured === true && !state.noteLock.unlocked,
      run: () => requestSessionUnlock(),
    },
  ];
}
