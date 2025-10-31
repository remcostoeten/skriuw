import type { Note } from '@/api/db/schema';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import { useMemo } from 'react';
import { useSearchState } from './use-search-state';
import { searchRepository } from '../repositories/search-repository';

export function useNoteSearch() {
  const { notes = [] } = useGetNotes();
  const searchState = useSearchState();

  const searchResults = useMemo(() => {
    if (!searchState.query) {
      return (notes as Note[])
        .filter((note: Note) => !note.folder)
        .map((note: Note) => ({
          item: note,
          highlightedText: note.title,
          matches: true
        }));
    }

    return searchRepository.searchNotes(notes as Note[], searchState.query, searchState.options);
  }, [notes, searchState.query, searchState.options]);

  return {
    notes: searchResults,
    searchState,
    isLoading: false // Search is synchronous, so no loading state needed
  };
}
