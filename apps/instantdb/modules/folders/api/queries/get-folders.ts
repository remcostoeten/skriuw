import { useQuery } from '@/lib/db/client';

export function useGetFolders() {
  const { data, isLoading } = useQuery({ folders: {} });
  const folders = (data?.folders || []).sort((a, b) => a.name.localeCompare(b.name));
  return { folders, isLoading };
}


