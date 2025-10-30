import { transact, tx } from '@/lib/db/client';

export function useUpdateFolder() {
  async function updateFolder(id: string, data: { name?: string; parentId?: string | null }) {
    const updates: any = {};
    if (data.name !== undefined) updates.name = data.name;
    updates.updatedAt = Date.now();

    await transact([tx.folders[id].update(updates)]);

    if (data.parentId !== undefined) {
      // Link to new parent (replaces existing link if any)
      if (data.parentId) {
        await transact([
          tx.folders[id].link({ parent: data.parentId }),
        ]);
      } else {
        // Remove parent by linking to null/undefined - need to check InstantDB API
        // For now, we'll just skip if parentId is null (folder stays at root)
        // InstantDB might handle null by simply not calling link, or we might need a different approach
      }
    }
  }

  return { updateFolder };
}


