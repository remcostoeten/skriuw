import { useCreate, useMutation } from '@/hooks/core';
import { generateId } from '@/shared/utils';
import { useGetFolders } from '@/modules/folders/api/queries/get-folders';
import { transact, tx } from '@/api/db/client';
import { Folder } from '@/api/db/schema';

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
  const { mutate, isLoading, error } = useMutation(async (parentId?: string) => {
    const existingNames = folders.map((f: Folder) => f.name);
    const name = nextDefaultFolderName(existingNames);
    const id = generateId();
    const now = Date.now();

    const siblingFolders = parentId
      ? folders.filter((f: Folder) => (f.parent as any)?.id === parentId)
      : folders.filter((f: Folder) => !f.parent);

    const position = siblingFolders.length > 0
      ? Math.max(...siblingFolders.map((f: Folder) => f.position || 0)) + 1
      : 0;

    await create(id, { name, createdAt: now, updatedAt: now, position });

    if (parentId) {
      await transact([tx.folders[id].link({ parent: parentId })]);
    }

    return { id, name };
  });

  return { createFolder: mutate, isLoading, error };
}


