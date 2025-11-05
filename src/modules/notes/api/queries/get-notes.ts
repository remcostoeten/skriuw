import { createQueryHook } from '@/hooks/core';
import type { Note } from '@/api/db/schema';

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
    select: (raw) => (raw?.notes as Note[]) ?? [],
    initialData: [] as Note[],
    showErrorToast: false,
  }
);

export function useGetNotes() {
  const { data, isLoading, error } = useNotesQuery();
  return { notes: data, isLoading, error };
}

