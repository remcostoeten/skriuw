import { useState } from 'react';
import { transact, tx } from '@/lib/db/client';

export function useUpdate<T extends Record<string, any>>(entityName: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const update = async (id: string, data: Partial<T>) => {
    try {
      setIsLoading(true);
      setError(null);

      await transact([
        tx[entityName as keyof typeof tx][id].update(data),
      ]);
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { update, isLoading, error };
}

