import { transact, tx } from '@/api/db/client';
import { useMutation } from '@/hooks/core/use-mutation';

type props = {
    title?: string;
    scope?: string;
    description?: string;
    status?: 'active' | 'completed' | 'archived';
}

export function useUpdateProject() {
    const { mutate, isLoading, error } = useMutation<
        { id: string; title?: string; scope?: string; description?: string; status?: 'active' | 'completed' | 'archived' },
        { id: string; input: props }
    >(async ({ id, input }) => {
        await transact([
            tx.projects[id].update({
                ...input,
                updatedAt: Date.now(),
            }),
        ]);
        return { id, ...input };
    });

    const updateProject = (id: string, input: props) => mutate({ id, input });
    return { updateProject, isLoading, error };
}

