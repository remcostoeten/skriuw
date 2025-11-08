import { transact, tx } from '@/api/db/client';
import { Folder } from '@/api/db/schema';
import { useCreate, useMutation } from '@/hooks/core';
import { useGetFolders } from '@/modules/folders/api/queries/get-folders';
import { generateId } from 'utils';
import { withTimestamps } from '@/shared/utilities/timestamps';

function nextDefaultFolderName(existing: string[]) {
  const base = 'Folder';
  if (!existing.includes(base)) return base;
  let i = 1;
  while (existing.includes(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

export function useCreateFolder() {
  const { create } = useCreate('folders');
  const { folders } = useGetFolders();
  const { mutate, isLoading, error } = useMutation(async (parentId?: UUID) => {
    const existingNames = folders.map((f: Folder) => f.name);
    const name = nextDefaultFolderName(existingNames);
    const id = generateId();

    const siblingFolders = parentId
      ? folders.filter((f: Folder) => (f.parent as any)?.id === parentId)
      : folders.filter((f: Folder) => !f.parent);

    const position = siblingFolders.length > 0
      ? Math.max(...siblingFolders.map((f: Folder & Positionable) => f.position || 0)) + 1
      : 0;

    await create(id, withTimestamps({ name, position }, true));

    if (parentId) {
      await transact([tx.folders[id].link({ parent: parentId })]);
    }

    return { id, name };
  });

  return { createFolder: mutate, isLoading, error };
}
