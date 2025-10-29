import { useRead } from '@/hooks/core';
import type { Note } from '@/lib/db/schema';

export function useGetNote(id: string | null) {
  const { data, isLoading, error } = useRead<{ notes: Note[] }>({
    notes: {
      $: {
        where: {
          id,
        },
      },
      tasks: {},
    },
  });

  return {
    note: data?.notes?.[0] || null,
    isLoading,
    error,
  };
}

