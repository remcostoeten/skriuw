import { useState } from 'react';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export function useDeleteTask() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteTask = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);

      await db.delete(tasks).where(eq(tasks.id, id));
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { deleteTask, isLoading, error };
}

