import { createQueryHook } from '@/hooks/core';
import type { Note } from '@/api/db/schema';
import { singleQueryOptions } from '@/shared/utilities/query-helpers';

const useNoteQuery = createQueryHook(
  (id: Nullable<UUID>) => ({
    notes: {
      $: {
        where: { id },
      },
      tasks: {},
    },
  }),
  {
    ...singleQueryOptions<Note>('notes'),
    enabled: (id) => !!id,
  }
);

export function useGetNote(id: Nullable<UUID>) {
  const { data, isLoading, error } = useNoteQuery(id);
  return { note: data, isLoading, error };
}

