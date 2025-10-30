import { transact, tx } from '@/lib/db/client';

export function useDestroyFolder() {
  async function destroyFolder(id: string) {
    await transact([tx.folders[id].update({ deletedAt: Date.now(), updatedAt: Date.now() })]);
  }
  return { destroyFolder };
}


