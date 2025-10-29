import { useState } from 'react';
import { db } from '@/lib/db/client';
import { notes } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export function useUpdateNote() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function updateNote(id: string, data: { title?: string; content?: string }) {
    try {
      setIsLoading(true);
      setError(null);

      await db
        .update(notes)
        .set({
          ...data,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(notes.id, id));
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateNote, isLoading, error };
}

