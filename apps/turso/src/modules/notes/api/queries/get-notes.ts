import { useEffect, useState } from 'react';
import { db } from '@/lib/db/client';
import { notes } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import type { Note } from '@/lib/db/schema';

export function useNotes() {
  const [data, setData] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = async () => {
    try {
      setIsLoading(true);
      const result = await db.select().from(notes).orderBy(desc(notes.updatedAt));
      setData(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refetch();
  }, []);

  return { data, isLoading, error, refetch };
}

