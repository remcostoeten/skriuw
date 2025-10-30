import { useQuery } from '@/lib/db/client';

export function useGetFolders() {
  const { data, isLoading } = useQuery({ 
    folders: {
      parent: {},
    }
  });
  const folders = (data?.folders || []).sort((a, b) => a.name.localeCompare(b.name));
  return { folders, isLoading };
}


