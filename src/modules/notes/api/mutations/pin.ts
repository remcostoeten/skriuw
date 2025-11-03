import { transact, tx } from '@/api/db/client';
import type { Note } from '@/api/db/schema';
import { useMutation } from '@/hooks/core';

type PinNoteInput = {
  noteId: string;
  notes: Note[];
  pinned: boolean;
}

export function usePinNote() {
  const { mutate, isLoading, error } = useMutation(async (input: PinNoteInput) => {
    const { noteId, notes, pinned } = input;

    const note = notes.find((n: Note) => n.id === noteId);
    if (!note) return;

    if (pinned) {
      // When pinning, move to top by setting position to negative of current timestamp
      // This ensures it appears at the top of pinned notes
      const pinnedNotes = notes.filter((n: Note) => n.pinned && n.id !== noteId);
      const maxPinnedPosition = pinnedNotes.length > 0
        ? Math.min(...pinnedNotes.map((n: Note) => n.position || 0))
        : 0;

      // Set position to be at the top of pinned notes
      const newPosition = maxPinnedPosition - 1;

      await transact([
        tx.notes[noteId].update({
          pinned: true,
          position: newPosition,
          updatedAt: Date.now()
        })
      ]);
    } else {
      // When unpinning, move to end of unpinned notes
      const unpinnedNotes = notes.filter((n: Note) => !n.pinned && n.id !== noteId);
      const maxUnpinnedPosition = unpinnedNotes.length > 0
        ? Math.max(...unpinnedNotes.map((n: Note) => n.position || 0))
        : Date.now();

      await transact([
        tx.notes[noteId].update({
          pinned: false,
          position: maxUnpinnedPosition + 1,
          updatedAt: Date.now()
        })
      ]);
    }

    return { id: noteId, pinned };
  });

  return { pinNote: mutate, isLoading, error };
}

