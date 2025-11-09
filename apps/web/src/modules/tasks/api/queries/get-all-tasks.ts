import type { Task } from '@/api/db/schema';
import { createQueryHook } from '@/hooks/core';
import { arrayQueryOptions } from '@/shared/utilities/query-helpers';

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
    arrayQueryOptions<Task>('tasks')
);

export function useGetAllTasks() {
    const { data, isLoading, error } = useAllTasksQuery();
    return { tasks: data, isLoading, error };
}


