'use client';

import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react';
import type { SearchOptions } from '../repositories/search-repository';

type SearchStateContextValue = {
  isOpen: boolean;
  query: string;
  options: SearchOptions;
  toggle: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  setOptions: (options: SearchOptions) => void;
  updateOptions: (key: keyof SearchOptions) => void;
};

const SearchStateContext = createContext<SearchStateContextValue | undefined>(undefined);

export function SearchStateProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
  });

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const newIsOpen = !prev;
      if (prev) { // Clear query when closing (prev was true)
        setQuery('');
      }
      return newIsOpen;
    });
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  const updateOptions = useCallback((key: keyof SearchOptions) => {
    setOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, close]);

  const value: SearchStateContextValue = {
    isOpen,
    query,
    options,
    toggle,
    close,
    setQuery,
    setOptions,
    updateOptions,
  };

  return (
    <SearchStateContext.Provider value={value}>
      {children}
    </SearchStateContext.Provider>
  );
}

export function useSearchStateContext() {
  const context = useContext(SearchStateContext);
  if (context === undefined) {
    throw new Error('useSearchStateContext must be used within a SearchStateProvider');
  }
  return context;
}

