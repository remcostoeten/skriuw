import { useMutation, useUpdate } from '@/hooks/core';

interface UpdateTaskInput {
  content?: string;
  completed?: boolean;
  position?: number;
  status?: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority?: 'low' | 'med' | 'high' | 'urgent';
  dueAt?: number;
}

export function useUpdateTask() {
  const { update } = useUpdate('tasks');
  const { mutate, isLoading, error } = useMutation(async ({ id, input }: { id: string; input: UpdateTaskInput }) => {
    await update(id, input);
    return { id };
  });
  const updateTask = (id: string, input: UpdateTaskInput) => mutate({ id, input });
  return { updateTask, isLoading, error };
}

