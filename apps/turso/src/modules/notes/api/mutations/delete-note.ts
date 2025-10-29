import { useState } from 'react';
import { db } from '@/lib/db/client';
import { notes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export function useDeleteNote() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function deleteNote(id: string) {
    try {
      setIsLoading(true);
      setError(null);

      await db.delete(notes).where(eq(notes.id, id));
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { deleteNote, isLoading, error };
}

