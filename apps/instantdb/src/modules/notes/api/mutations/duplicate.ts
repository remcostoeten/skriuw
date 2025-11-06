import { transact, tx } from '@/api/db/client';
import type { Note } from '@/api/db/schema';
import { useMutation } from '@/hooks/core';
import { generateId } from 'utils';

type DuplicateNoteInput = {
  noteId: string;
  notes: Note[];
}

export function useDuplicateNote() {
  const { mutate, isLoading, error } = useMutation(async (input: DuplicateNoteInput) => {
    const { noteId, notes } = input;

    const sourceNote = notes.find((n: Note) => n.id === noteId);
    if (!sourceNote) return;

    // Find the source note's position and folder
    const sourceFolderId = (sourceNote.folder as any)?.id || null;
    const sourcePosition = sourceNote.position || 0;

    // Get all notes in the same folder (or root)
    const siblingNotes = sourceFolderId
      ? notes.filter((n: Note) => (n.folder as any)?.id === sourceFolderId && n.id !== noteId)
      : notes.filter((n: Note) => !(n.folder as any) && n.id !== noteId);

    // Find notes that come after the source note
    const notesAfter = siblingNotes.filter((n: Note) => (n.position || 0) > sourcePosition);

    // Calculate new position - place it right after the source note
    let newPosition: number;
    if (notesAfter.length > 0) {
      const nextNote = notesAfter.sort((a: Note, b: Note) => (a.position || 0) - (b.position || 0))[0];
      const nextPosition = nextNote.position || 0;
      newPosition = (sourcePosition + nextPosition) / 2;
    } else {
      newPosition = sourcePosition + 1;
    }

    const newId = generateId();
    const now = Date.now();

    const transactions = [
      tx.notes[newId].update({
        title: `${sourceNote.title} (Copy)`,
        content: sourceNote.content || '',
        position: newPosition,
        createdAt: now,
        updatedAt: now,
      })
    ];

    if (sourceFolderId) {
      transactions.push(tx.notes[newId].link({ folder: sourceFolderId }));
    }

    await transact(transactions);

    return { id: newId, position: newPosition };
  });

  return { duplicateNote: mutate, isLoading, error };
}

