import { transact, tx, db } from '@/api/db/client';
import { useMutation } from '@/hooks/core';
import { withTimestamps } from '@/shared/utilities/timestamps';
import { updateRelation } from '@/shared/utilities/relations';

export function useUpdateFolder() {
  const { mutate, isLoading, error } = useMutation(
    async ({ id, data, currentParentId }: {
      id: UUID;
      data: { name?: string; parentId?: Nullable<UUID>; position?: number };
      currentParentId?: Nullable<UUID>;
    }) => {
      const operations: any[] = [];
      
      // Build update operations
      const updates: any = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.position !== undefined) updates.position = data.position;
      
      operations.push(tx.folders[id].update(withTimestamps(updates)));

      // Handle parent relationship changes
      if (data.parentId !== undefined) {
        // Fetch current parent if not provided (needed for conditional unlink logic)
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

        // Only update relation if it's actually changing
        if (effectiveCurrentParentId !== data.parentId) {
          operations.push(...updateRelation('folders', id, 'parent', data.parentId));
        }
      }
      
      // Execute all operations in a single atomic transaction
      await transact(operations);
      return { id };
    }
  );

  const updateFolder = (
    id: UUID,
    data: { name?: string; parentId?: Nullable<UUID>; position?: number },
    currentParentId?: Nullable<UUID>
  ) => mutate({ id, data, currentParentId });
  return { updateFolder, isLoading, error };
}


