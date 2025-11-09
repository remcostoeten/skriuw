import { createQueryHook } from '@/hooks/core';
import { selectArray } from '@/shared/utilities/query-helpers';

const useFoldersQuery = createQueryHook(
  () => ({
    folders: {
      parent: {},
    },
  }),
  {
    select: (raw) => {
      const folders = selectArray<any>('folders')(raw);
      return folders.slice().sort((a: any, b: any) => a.name.localeCompare(b.name));
    },
    initialData: [] as any[],
  }
);

export function useGetFolders() {
  const { data, isLoading } = useFoldersQuery();
  return { folders: data, isLoading };
}


