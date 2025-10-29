import { useUpdate } from '@/hooks/core';

interface UpdateTaskInput {
  content?: string;
  completed?: boolean;
  position?: number;
}

export function useUpdateTask() {
  const { update, isLoading, error } = useUpdate('tasks');

  const updateTask = async (id: string, input: UpdateTaskInput) => {
    return update(id, input);
  };

  return { updateTask, isLoading, error };
}

