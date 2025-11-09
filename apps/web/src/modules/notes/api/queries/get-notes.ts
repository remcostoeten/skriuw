import { createQueryHook } from '@/hooks/core';
import type { Note } from '@/api/db/schema';
import { arrayQueryOptions } from '@/shared/utilities/query-helpers';

const useNotesQuery = createQueryHook(
  () => ({
    notes: {
      $: {
        order: { createdAt: 'desc' },
      },
      tasks: {},
      folder: {},
    },
  }),
  {
    ...arrayQueryOptions<Note>('notes'),
    showErrorToast: false,
  }
);

export function useGetNotes() {
  const { data, isLoading, error } = useNotesQuery();
  return { notes: data, isLoading, error };
}

