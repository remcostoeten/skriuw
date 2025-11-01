import { createQueryHook } from '@/hooks/core';
import type { Task } from '@/api/db/schema';

const useTasksQuery = createQueryHook(
  (noteId: string | null) => ({
    tasks: {
      $: {
        ...(noteId ? { where: { 'note.id': noteId } } : {}),
        order: { createdAt: 'desc' },
      },
      note: {},
      project: {},
      subtasks: {
        $: { order: { createdAt: 'desc' } },
      },
      dependsOn: {
        $: {},
      },
      comments: {
        $: {},
      },
    },
  }),
  {
    select: (raw) => {
      const tasks = (raw?.tasks as Task[]) ?? [];
      // Sort by position client-side since it's not indexed on server yet
      return tasks.sort((a, b) => (a.position || 0) - (b.position || 0));
    },
    initialData: [] as Task[],
  }
);

export function useGetTasks(noteId: string | null) {
  const { data, isLoading, error } = useTasksQuery(noteId);
  return { tasks: data, isLoading, error };
}

