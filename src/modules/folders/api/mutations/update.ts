import { transact, tx, db } from '@/api/db/client';
import { useMutation } from '@/hooks/core';

export function useUpdateFolder() {
  const { mutate, isLoading, error } = useMutation(
    async ({ id, data, currentParentId }: {
      id: string;
      data: { name?: string; parentId?: string | null; position?: number };
      currentParentId?: string | null;
    }) => {
      const updates: any = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.position !== undefined) updates.position = data.position;
      updates.updatedAt = Date.now();

      await transact([tx.folders[id].update(updates)]);

      if (data.parentId !== undefined) {
        // Fetch current parent if not provided and we're changing the parent
        let effectiveCurrentParentId = currentParentId;

        if (effectiveCurrentParentId === undefined) {
          const result = await db.queryOnce({
            folders: {
              $: { where: { id } },
              parent: {},
            },
          });
          effectiveCurrentParentId = result?.data?.folders?.[0]?.parent?.id || null;
        }

        // If we're setting parentId to null and there's a current parent, unlink first
        if (!data.parentId && effectiveCurrentParentId) {
          await transact([tx.folders[id].unlink({ parent: effectiveCurrentParentId })]);
        } else if (data.parentId) {
          // If there's an existing parent that's different, unlink first
          if (effectiveCurrentParentId && effectiveCurrentParentId !== data.parentId) {
            await transact([tx.folders[id].unlink({ parent: effectiveCurrentParentId })]);
          }
          await transact([tx.folders[id].link({ parent: data.parentId })]);
        }
      }
      return { id };
    }
  );

  const updateFolder = (
    id: string,
    data: { name?: string; parentId?: string | null; position?: number },
    currentParentId?: string | null
  ) => mutate({ id, data, currentParentId });
  return { updateFolder, isLoading, error };
}


