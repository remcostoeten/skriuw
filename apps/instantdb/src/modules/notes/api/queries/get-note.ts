import { createQueryHook } from '@/hooks/core';
import type { Note } from '@/api/db/schema';

const useNoteQuery = createQueryHook(
  (id: string | null) => ({
    notes: {
      $: {
        where: { id },
      },
      tasks: {},
    },
  }),
  {
    select: (raw) => (raw?.notes?.[0] as Note | null) ?? null,
    initialData: null as Note | null,
    enabled: (id) => !!id,
  }
);

export function useGetNote(id: string | null) {
  const { data, isLoading, error } = useNoteQuery(id);
  return { note: data, isLoading, error };
}

