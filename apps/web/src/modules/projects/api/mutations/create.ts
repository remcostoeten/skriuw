import { transact, tx } from '@/api/db/client';
import { useMutation } from '@/hooks/core';
import { useGetProjects } from '@/modules/projects/api/queries/get-projects';
import { generateId } from 'utils';
import { withTimestamps } from '@/shared/utilities/timestamps';

type props = {
    title: string;
    scope?: string;
    description?: string;
    status?: 'active' | 'completed' | 'archived';
} & Positionable;

export function useCreateProject() {
    const { projects } = useGetProjects();
    const { mutate, isLoading, error } = useMutation(async (input: props) => {
        const id = generateId();

        const position = projects.length > 0
            ? Math.max(...projects.map((p) => (p as any).position || 0)) + 1
            : 0;

        await transact([
            tx.projects[id].update(withTimestamps({
                title: input.title,
                scope: input.scope,
                description: input.description,
                status: input.status ?? 'active',
                position,
            }, true)),
        ]);
        return { id, ...input };
    });

    return { createProject: mutate, isLoading, error };
}

