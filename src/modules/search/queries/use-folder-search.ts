import { useMemo } from 'react';
import { useGetFolders } from '@/modules/folders/api/queries/get-folders';
import { useSearchState } from './use-search-state';
import { searchRepository } from '../repositories/search-repository';
import type { Folder } from '@/api/db/schema';

export function useFolderSearch() {
  const { data: folders = [] } = useGetFolders();
  const searchState = useSearchState();

  const searchResults = useMemo(() => {
    if (!searchState.query) {
      return folders
        .filter(folder => !folder.deletedAt && !folder.parent)
        .map(folder => ({
          item: folder,
          highlightedText: folder.name,
          matches: true
        }));
    }

    return searchRepository.searchFolders(folders, searchState.query, searchState.options);
  }, [folders, searchState.query, searchState.options]);

  return {
    folders: searchResults,
    searchState,
    isLoading: false // Search is synchronous, so no loading state needed
  };
}