import { useMutation, useUpdate } from '@/hooks/core';

type props = {
  content?: string;
  completed?: boolean;
  position?: number;
  status?: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority?: 'low' | 'med' | 'high' | 'urgent';
  dueAt?: number;
}

export function useUpdateTask() {
  const { update } = useUpdate('tasks');
  const { mutate, isLoading, error } = useMutation(async ({ id, input }: { id: string; input: Partial<props> }) => {
    await update(id, input);
    return { id };
  });
  const updateTask = (id: string, input: props) => mutate({ id, input });
  return { updateTask, isLoading, error };
}

