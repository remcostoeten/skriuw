import { useState, useMemo } from 'react';
import type { SearchOptions } from '../repositories/search-repository';

export function useSearchState() {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false
  });
  const [isOpen, setIsOpen] = useState(false);

  const actions = useMemo(() => ({
    setQuery,
    setOptions: (newOptions: Partial<SearchOptions>) =>
      setOptions(prev => ({ ...prev, ...newOptions })),
    toggleCaseSensitive: () =>
      setOptions(prev => ({ ...prev, caseSensitive: !prev.caseSensitive })),
    toggleWholeWord: () =>
      setOptions(prev => ({ ...prev, wholeWord: !prev.wholeWord })),
    open: () => setIsOpen(true),
    close: () => {
      setIsOpen(false);
      setQuery('');
    },
    toggle: () => setIsOpen(prev => !prev),
    clear: () => setQuery('')
  }), []);

  return {
    query,
    options,
    isOpen,
    ...actions
  };
}