'use client';

import { useGetFolders } from '@/modules/folders/api/queries/get-folders';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import { useMemo } from 'react';
import { searchRepository } from '../repositories/search-repository';
import { useSearchState } from './use-search-state';

export function useSidebarSearch() {
  const { folders = [] } = useGetFolders();
  const { notes = [] } = useGetNotes();
  const searchState = useSearchState();

  const searchResults = useMemo(() => {
    return searchRepository.searchSidebar(
      folders as any[],
      notes as any[],
      searchState.query,
      searchState.options
    );
  }, [folders, notes, searchState.query, searchState.options]);

  const hasResults = useMemo(() => {
    return (
      searchResults.folders.length > 0 ||
      searchResults.notes.length > 0 ||
      !searchState.query
    );
  }, [searchResults, searchState.query]);

  return {
    folders: searchResults.folders,
    notes: searchResults.notes,
    searchState,
    hasResults,
  };
}
