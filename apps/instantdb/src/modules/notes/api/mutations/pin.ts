import { transact, tx } from '@/api/db/client';
import type { Note } from '@/api/db/schema';
import { useMutation } from '@/hooks/core';
import { withTimestamps } from '@/shared/utilities/timestamps';

type props = {
  noteId: UUID;
  notes: Note[];
  pinned: boolean;
}

export function usePinNote() {
  const { mutate, isLoading, error } = useMutation(async (input: props) => {
    const { noteId, notes, pinned } = input;

    const note = notes.find((n: Note) => n.id === noteId);
    if (!note) return;

    // Get the folder ID for this note (null for root notes)
    const noteFolderId = (note.folder as any)?.id || null;

    // Filter notes by the same folder context
    const folderNotes = notes.filter((n: Note) => {
      const folderId = (n.folder as any)?.id || null;
      return folderId === noteFolderId;
    });

    if (pinned) {
      // When pinning, move to top by setting position to be at the top of pinned notes in the same folder
      const pinnedNotes = folderNotes.filter((n: Note) => n.pinned && n.id !== noteId);
      const maxPinnedPosition = pinnedNotes.length > 0
        ? Math.min(...pinnedNotes.map((n: Note) => n.position || 0))
        : 0;

      // Set position to be at the top of pinned notes
      const newPosition = maxPinnedPosition - 1;

      await transact([
        tx.notes[noteId].update(withTimestamps({
          pinned: true,
          position: newPosition,
        }))
      ]);
    } else {
      // When unpinning, move to end of unpinned notes in the same folder
      const unpinnedNotes = folderNotes.filter((n: Note) => !n.pinned && n.id !== noteId);
      const maxUnpinnedPosition = unpinnedNotes.length > 0
        ? Math.max(...unpinnedNotes.map((n: Note) => n.position || 0))
        : Date.now();

      await transact([
        tx.notes[noteId].update(withTimestamps({
          pinned: false,
          position: maxUnpinnedPosition + 1,
        }))
      ]);
    }

    return { id: noteId, pinned };
  });

  return { pinNote: mutate, isLoading, error };
}

