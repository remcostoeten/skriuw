import { useDestroy } from '@/hooks/core';

export function useDestroyTask() {
  const { destroy, isLoading, error } = useDestroy('tasks');

  const destroyTask = async (id: string) => {
    return destroy(id);
  };

  return { destroyTask, isLoading, error };
}

