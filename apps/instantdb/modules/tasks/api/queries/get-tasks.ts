import { useRead } from '@/hooks/core';
import type { Task } from '@/lib/db/schema';

export function useGetTasks(noteId: string | null) {
  const { data, isLoading, error } = useRead<{ tasks: Task[] }>({
    tasks: {
      $: {
        where: {
          'note.id': noteId,
        },
        order: {
          position: 'asc',
        },
      },
    },
  });

  return {
    tasks: data?.tasks || [],
    isLoading,
    error,
  };
}

