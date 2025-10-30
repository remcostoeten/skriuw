import { transact, tx } from '@/lib/db/client';

export function useUpdateFolder() {
  async function updateFolder(id: string, data: { name?: string; parentId?: string | null }) {
    const updates: any = {};
    if (data.name !== undefined) updates.name = data.name;
    updates.updatedAt = Date.now();

    await transact([tx.folders[id].update(updates)]);

    if (data.parentId !== undefined) {
      // disconnect any existing parent
      await transact([tx.parentFolders.disconnect({ from: { folders: id } })]);
      if (data.parentId) {
        await transact([tx.parentFolders.connect({ from: { folders: id }, to: { folders: data.parentId } })]);
      }
    }
  }

  return { updateFolder };
}


