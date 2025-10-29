import { tx, transact, useQuery } from '@/lib/db/client';

function nextDefaultFolderName(existing: string[]) {
  const base = 'Folder';
  if (!existing.includes(base)) return base;
  let i = 1;
  while (existing.includes(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

export function useCreateFolder() {
  const { data } = useQuery({ folders: {} });
  const existingNames = (data?.folders || []).map((f) => f.name);

  async function createFolder(parentId?: string) {
    const name = nextDefaultFolderName(existingNames);
    const now = Date.now();
    const createFolderTx = tx.folders[id => ({
      id,
      name,
      createdAt: now,
      updatedAt: now,
    })].insert();

    const res = await transact(createFolderTx);
    const folderId = res?.[0]?.id as string;

    if (parentId && folderId) {
      await transact(tx.parentFolders.connect({
        from: { folders: folderId },
        to: { folders: parentId },
      }));
    }

    return { id: folderId, name };
  }

  return { createFolder };
}


