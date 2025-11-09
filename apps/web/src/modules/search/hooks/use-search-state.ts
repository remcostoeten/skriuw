'use client';

import { useSearchStateContext } from '../context/search-state-context';

// Re-export the hook from context for backward compatibility
export function useSearchState() {
  return useSearchStateContext();
}
