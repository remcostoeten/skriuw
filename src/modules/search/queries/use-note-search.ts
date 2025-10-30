import { useMemo } from 'react';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import { useSearchState } from './use-search-state';
import { searchRepository } from '../repositories/search-repository';
import type { Note } from '@/api/db/schema';

export function useNoteSearch() {
  const { data: notes = [] } = useGetNotes();
  const searchState = useSearchState();

  const searchResults = useMemo(() => {
    if (!searchState.query) {
      return notes
        .filter(note => !note.folder)
        .map(note => ({
          item: note,
          highlightedText: note.title,
          matches: true
        }));
    }

    return searchRepository.searchNotes(notes, searchState.query, searchState.options);
  }, [notes, searchState.query, searchState.options]);

  return {
    notes: searchResults,
    searchState,
    isLoading: false // Search is synchronous, so no loading state needed
  };
}