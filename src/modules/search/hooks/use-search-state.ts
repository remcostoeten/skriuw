'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SearchOptions } from '../repositories/search-repository';

export function useSearchState() {
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

  return {
    isOpen,
    query,
    options,
    toggle,
    close,
    setQuery,
    setOptions,
    updateOptions,
  };
}
