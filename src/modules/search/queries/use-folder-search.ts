import { useMemo } from 'react';
import { useGetFolders } from '@/modules/folders/api/queries/get-folders';
import { useSearchState } from './use-search-state';
import { searchRepository } from '../repositories/search-repository';
import type { Folder } from '@/api/db/schema';

export function useFolderSearch() {
  const { folders = [] } = useGetFolders();
  const searchState = useSearchState();

  const searchResults = useMemo(() => {
    if (!searchState.query) {
      return (folders as Folder[])
        .filter((folder: Folder) => !folder.deletedAt && !folder.parent)
        .map((folder: Folder) => ({
          item: folder,
          highlightedText: folder.name,
          matches: true
        }));
    }

    return searchRepository.searchFolders(folders as Folder[], searchState.query, searchState.options);
  }, [folders, searchState.query, searchState.options]);

  return {
    folders: searchResults,
    searchState,
    isLoading: false // Search is synchronous, so no loading state needed
  };
}