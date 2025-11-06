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

        // Always unlink from current parent if it exists and is different from the new parent
        if (effectiveCurrentParentId && effectiveCurrentParentId !== data.parentId) {
          await transact([tx.folders[id].unlink({ parent: effectiveCurrentParentId })]);
        }

        // Link to new parent if parentId is not null
        if (data.parentId) {
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


