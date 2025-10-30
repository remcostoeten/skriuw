import { useMemo } from 'react';
import { useGetFolders } from '@/modules/folders/api/queries/get-folders';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import { useSearchState } from './use-search-state';
import { searchRepository } from '../repositories/search-repository';

export function useSidebarSearch() {
  const { data: folders = [] } = useGetFolders();
  const { data: notes = [] } = useGetNotes();
  const searchState = useSearchState();

  const searchResults = useMemo(() => {
    return searchRepository.searchSidebar(folders, notes, searchState.query, searchState.options);
  }, [folders, notes, searchState.query, searchState.options]);

  const hasResults = useMemo(() => {
    return searchResults.folders.length > 0 || searchResults.notes.length > 0 || !searchState.query;
  }, [searchResults, searchState.query]);

  return {
    folders: searchResults.folders,
    notes: searchResults.notes,
    searchState,
    hasResults,
    isLoading: false // Search is synchronous, so no loading state needed
  };
}