import { createQueryHook } from '@/hooks/core';
import type { Task } from '@/api/db/schema';

const useTasksQuery = createQueryHook(
  (noteId: string | null) => ({
    tasks: {
      $: {
        where: { 'note.id': noteId },
        order: { position: 'asc' },
      },
      subtasks: {
        $: { order: { position: 'asc' } },
      },
      dependsOn: {
        $: {},
      },
      comments: {
        $: { order: { createdAt: 'asc' } },
      },
      activity: {
        $: { order: { createdAt: 'desc' } },
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

