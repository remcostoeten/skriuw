import { useState } from 'react';
import { transact, tx } from '@/lib/db/client';

export function useDestroy(entityName: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const destroy = async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);

      await transact([
        tx[entityName as keyof typeof tx][id].delete(),
      ]);
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { destroy, isLoading, error };
}

