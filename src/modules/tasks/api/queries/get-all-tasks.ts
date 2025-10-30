import { createQueryHook } from '@/hooks/core';
import type { Task } from '@/api/db/schema';

const useAllTasksQuery = createQueryHook(
    () => ({
        tasks: {
            $: { order: { createdAt: 'desc' } },
        },
    }),
    {
        select: (raw) => (raw?.tasks as Task[]) ?? [],
        initialData: [] as Task[],
    }
);

export function useGetAllTasks() {
    const { data, isLoading, error } = useAllTasksQuery();
    return { tasks: data, isLoading, error };
}


