import { useEffect, useState } from 'react';
import { db } from '@/lib/db/client';
import { notes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { Note } from '@/lib/db/schema';

export function useNote(id: string | null) {
  const [data, setData] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  async function refetch() {
      if (!id) {
      setData(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const result = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
      setData(result[0] || null);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refetch();
  }, [id]);

  return { data, isLoading, error, refetch };
}

