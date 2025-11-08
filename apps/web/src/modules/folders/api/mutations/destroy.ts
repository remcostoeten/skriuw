import { transact, tx } from '@/api/db/client';
import { useMutation } from '@/hooks/core';

export function useDestroyFolder() {
  const { mutate, isLoading, error } = useMutation(async (id: string) => {
    await transact([
      tx.folders[id].update({ deletedAt: Date.now(), updatedAt: Date.now() })
    ]);
    return { id };
  });
  return { destroyFolder: mutate, isLoading, error };
}


