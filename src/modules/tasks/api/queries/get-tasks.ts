import { createQueryHook } from '@/hooks/core';
import type { Task } from '@/api/db/schema';

const useTasksQuery = createQueryHook(
  (noteId: string | null) => ({
    tasks: {
      $: {
        where: { 'note.id': noteId },
        order: { position: 'asc' },
      },
    },
  }),
  {
    select: (raw) => (raw?.tasks as Task[]) ?? [],
    initialData: [] as Task[],
    enabled: (noteId) => !!noteId,
  }
);

export function useGetTasks(noteId: string | null) {
  const { data, isLoading, error } = useTasksQuery(noteId);
  return { tasks: data, isLoading, error };
}

