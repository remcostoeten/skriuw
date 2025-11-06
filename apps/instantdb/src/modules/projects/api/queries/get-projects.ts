import type { Project } from '@/api/db/schema';
import { createQueryHook } from '@/hooks/core';
import { arrayQueryOptions } from '@/shared/utilities/query-helpers';

const useProjectsQuery = createQueryHook(
    () => ({
        projects: {
            $: {
                order: { position: 'asc' },
            },
            tasks: {
                $: { order: { position: 'asc' } },
            },
        },
    }),
    arrayQueryOptions<Project>('projects')
);

export function useGetProjects() {
    const { data, isLoading, error } = useProjectsQuery();
    return { projects: data, isLoading, error };
}

