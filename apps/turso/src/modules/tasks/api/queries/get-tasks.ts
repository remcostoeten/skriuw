import { useEffect, useState } from 'react';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import type { Task } from '@/lib/db/schema';

export function useTasks(noteId: string | null) {
  const [data, setData] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = async () => {
    if (!noteId) {
      setData([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const result = await db
        .select()
        .from(tasks)
        .where(eq(tasks.noteId, noteId))
        .orderBy(asc(tasks.position));
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
  }, [noteId]);

  return { data, isLoading, error, refetch };
}

