import { useState } from 'react';
import { db } from '@/lib/db/client';
import { notes } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import type { NewNote } from '@/lib/db/schema';

export function useCreateNote() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);


  async function createNote(data: Omit<NewNote, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      setIsLoading(true);
      setError(null);

      const newNote = {
        id: generateId(),
        ...data,
      };

      await db.insert(notes).values(newNote);
      return newNote;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { createNote, isLoading, error };
}

