import { transact, tx } from '@/api/db/client';
import { useMutation } from '@/hooks/core';

export function useDestroyProject() {
    const { mutate, isLoading, error } = useMutation(async (id: string) => {
        await transact([tx.projects[id].delete()]);
        return { id };
    });

    return { destroyProject: mutate, isLoading, error };
}
