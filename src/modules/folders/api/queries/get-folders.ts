import { createQueryHook } from '@/hooks/core';

const useFoldersQuery = createQueryHook(
  () => ({
    folders: {
      parent: {},
    },
  }),
  {
    select: (raw) => (raw?.folders ?? []).slice().sort((a: any, b: any) => a.name.localeCompare(b.name)),
    initialData: [] as any[],
  }
);

export function useGetFolders() {
  const { data, isLoading } = useFoldersQuery();
  return { folders: data, isLoading };
}


