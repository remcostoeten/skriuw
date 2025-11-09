import { transact, tx } from '@/api/db/client';
import { useMutation } from '@/hooks/core/use-mutation';
import { withTimestamps } from '@/shared/utilities/timestamps';

type props = {  
    title?: string;
    scope?: string;
    description?: string;
    status?: 'active' | 'completed' | 'archived';
}

export function useUpdateProject() {
    const { mutate, isLoading, error } = useMutation<
        { id: UUID; title?: string; scope?: string; description?: string; status?: 'active' | 'completed' | 'archived' },
        { id: UUID; input: props }
    >(async ({ id, input }) => {
        await transact([
            tx.projects[id].update(withTimestamps(input)),
        ]);
        return { id, ...input };
    });

    const updateProject = (id: UUID, input: props) => mutate({ id, input });  
    return { updateProject, isLoading, error };
}

