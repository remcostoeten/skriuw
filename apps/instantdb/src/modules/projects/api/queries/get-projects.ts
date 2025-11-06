import type { Project } from '@/api/db/schema';
import { createQueryHook } from '@/hooks/core';

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
    {
        select: (raw) => (raw?.projects as Project[]) ?? [],
        initialData: [] as Project[],
    }
);

export function useGetProjects() {
    const { data, isLoading, error } = useProjectsQuery();
    return { projects: data, isLoading, error };
}

