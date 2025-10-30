import { useMutation, useUpdate } from '@/hooks/core';
import { transact, tx } from '@/api/db/client';

type props = {
  content?: string;
  completed?: boolean;
  position?: number;
  status?: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority?: 'low' | 'med' | 'high' | 'urgent';
  dueAt?: number;
  tags?: string[];
  parentId?: string | null;
  dependsOnIds?: string[];
};

export function useUpdateTask() {
  const { update } = useUpdate('tasks');
  const { mutate, isLoading, error } = useMutation(async ({ id, input }: { id: string; input: Partial<props> }) => {
    const scalarInput = {
      ...input,
      tags: Array.isArray(input.tags) ? input.tags.join(',') : input.tags,
    } as any;
    await update(id, scalarInput);

    if (input.parentId !== undefined) {
      await transact([
        tx.tasks[id].unlink({ parent: null as any }),
        ...(input.parentId ? [tx.tasks[id].link({ parent: input.parentId })] : []),
      ]);
    }

    if (input.dependsOnIds) {
      await transact([
        tx.tasks[id].unlink({ dependsOn: null as any }),
        ...input.dependsOnIds.map(depId => tx.tasks[id].link({ dependsOn: depId })),
      ]);
    }
    return { id };
  });
  const updateTask = (id: string, input: props) => mutate({ id, input });
  return { updateTask, isLoading, error };
}

