import { transact, tx } from '@/lib/db/client';

export function useDestroyFolder() {
  async function destroyFolder(id: string) {
    // Note: InstantDB doesn't have deletedAt in schema, so we'll handle soft deletes at query level
    // For now, we'll just update the timestamp
    await transact([tx.folders[id].update({ updatedAt: Date.now() })]);
  }
  return { destroyFolder };
}


