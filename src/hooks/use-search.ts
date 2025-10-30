import { useState, useMemo } from 'react';

export type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
};

export type SearchState = {
  query: string;
  options: SearchOptions;
  isOpen: boolean;
};

export function useSearch(initialState?: Partial<SearchState>) {
  const [search, setSearch] = useState<SearchState>({
    query: '',
    options: {
      caseSensitive: false,
      wholeWord: false,
    },
    isOpen: false,
    ...initialState,
  });

  const actions = useMemo(() => ({
    setQuery: (query: string) =>
      setSearch(prev => ({ ...prev, query })),

    setOptions: (options: Partial<SearchOptions>) =>
      setSearch(prev => ({
        ...prev,
        options: { ...prev.options, ...options }
      })),

    toggleCaseSensitive: () =>
      setSearch(prev => ({
        ...prev,
        options: { ...prev.options, caseSensitive: !prev.options.caseSensitive }
      })),

    toggleWholeWord: () =>
      setSearch(prev => ({
        ...prev,
        options: { ...prev.options, wholeWord: !prev.options.wholeWord }
      })),

    open: () => setSearch(prev => ({ ...prev, isOpen: true })),

    close: () => setSearch(prev => ({
      ...prev,
      isOpen: false,
      query: ''
    })),

    toggle: () => setSearch(prev => ({
      ...prev,
      isOpen: !prev.isOpen,
      query: prev.isOpen ? '' : prev.query
    })),

    clear: () => setSearch(prev => ({ ...prev, query: '' })),

    reset: () => setSearch({
      query: '',
      options: { caseSensitive: false, wholeWord: false },
      isOpen: false,
    }),
  }), []);

  return {
    ...search,
    ...actions,
  };
}