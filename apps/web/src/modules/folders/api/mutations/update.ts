import { transact, tx, db } from '@/api/db/client';
import { useMutation } from '@/hooks/core';
import { withTimestamps } from '@/shared/utilities/timestamps';

export function useUpdateFolder() {
  const { mutate, isLoading, error } = useMutation(
    async ({ id, data, currentParentId }: {
      id: UUID;
      data: { name?: string; parentId?: Nullable<UUID>; position?: number };
      currentParentId?: Nullable<UUID>;
    }) => {
      const operations: any[] = [];
      
      // Build update operations
      const updates: Record<string, any> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.position !== undefined) updates.position = data.position;

      // Always bump updatedAt when we have scalar updates
      const shouldUpdateTimestamp =
        Object.keys(updates).length > 0 || data.parentId !== undefined;
      if (shouldUpdateTimestamp) {
        operations.push(tx.folders[id].update(withTimestamps(updates)));
      }

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
          effectiveCurrentParentId = result?.data?.folders?.[0]?.parent?.id ?? null;
        }

        // Only update relation if it's actually changing
        if (effectiveCurrentParentId !== data.parentId) {
          if (effectiveCurrentParentId) {
            operations.push(
              tx.folders[id].unlink({
                parent: null as any,
              })
            );
          }

          if (data.parentId) {
            operations.push(
              tx.folders[id].link({
                parent: data.parentId,
              })
            );
          }
        }
      }
      
      if (!operations.length) {
        return { id };
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


