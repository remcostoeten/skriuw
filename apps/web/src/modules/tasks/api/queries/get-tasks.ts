import { createQueryHook } from '@/hooks/core';
import type { Task } from '@/api/db/schema';
import { selectArray } from '@/shared/utilities/query-helpers';

const useTasksQuery = createQueryHook(
  (noteId: Nullable<UUID>) => ({
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
      const tasks = selectArray<Task>('tasks')(raw);
      // Sort by position client-side since it's not indexed on server yet
      return tasks.sort((a, b) => ((a as any).position || 0) - ((b as any).position || 0));
    },
    initialData: [] as Task[],
  }
);

export function useGetTasks(noteId: Nullable<UUID>) {
  const { data, isLoading, error } = useTasksQuery(noteId);
  return { tasks: data, isLoading, error };
}

