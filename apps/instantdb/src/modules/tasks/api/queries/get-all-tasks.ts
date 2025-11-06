import type { Task } from '@/api/db/schema';
import { createQueryHook } from '@/hooks/core';

const useAllTasksQuery = createQueryHook(
    () => ({
        tasks: {
            $: { order: { createdAt: 'desc' } },
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
            // Keep the existing order by createdAt for top-level tasks
            return tasks;
        },
        initialData: [] as Task[],
    }
);

export function useGetAllTasks() {
    const { data, isLoading, error } = useAllTasksQuery();
    return { tasks: data, isLoading, error };
}


