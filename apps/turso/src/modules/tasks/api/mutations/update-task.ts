import { useState } from 'react';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export function useUpdateTask() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateTask = async (
    id: string,
    data: { content?: string; completed?: boolean; position?: number }
  ) => {
    try {
      setIsLoading(true);
      setError(null);

      await db.update(tasks).set(data).where(eq(tasks.id, id));
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateTask, isLoading, error };
}

