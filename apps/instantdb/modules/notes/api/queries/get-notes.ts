import { useRead } from '@/hooks/core';
import type { Note } from '@/lib/db/schema';

export function useGetNotes() {
  const { data, isLoading, error } = useRead<{ notes: Note[] }>({
    notes: {
      $: {
        order: {
          serverCreatedAt: 'desc',
        },
      },
      tasks: {},
    },
  });

  return {
    notes: data?.notes || [],
    isLoading,
    error,
  };
}

