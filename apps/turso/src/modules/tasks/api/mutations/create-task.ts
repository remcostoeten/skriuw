import { useState } from 'react';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import type { NewTask } from '@/lib/db/schema';

export function useCreateTask() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function createTask(data: Omit<NewTask, 'id' | 'createdAt'>) {
    try {
      setIsLoading(true);
      setError(null);

      const newTask = {
        id: generateId(),
        ...data,
      };

      await db.insert(tasks).values(newTask);
      return newTask;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { createTask, isLoading, error };
}

