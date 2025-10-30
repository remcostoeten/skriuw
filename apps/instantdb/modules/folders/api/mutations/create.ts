import { useCreate } from '@/hooks/core';
import { generateId } from '@/lib/utils';
import { useGetFolders } from '@/modules/folders/api/queries/get-folders';
import { transact, tx } from '@/lib/db/client';

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
  const existingNames = folders.map((f) => f.name);

  async function createFolder(parentId?: string) {
    const name = nextDefaultFolderName(existingNames);
    const id = generateId();
    const now = Date.now();

    await create(id, {
      name,
      createdAt: now,
      updatedAt: now,
    });

    if (parentId) {
      await transact([
        tx.folders[id].link({ parent: parentId }),
      ]);
    }

    return { id, name };
  }

  return { createFolder };
}


