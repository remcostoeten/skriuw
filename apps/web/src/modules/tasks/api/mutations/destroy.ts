import { useDestroy, useMutation } from '@/hooks/core';

export function useDestroyTask() {
  const { destroy } = useDestroy('tasks');
  const { mutate, isLoading, error } = useMutation(async (id: string) => {
    await destroy(id);
    return { id };
  });
  return { destroyTask: mutate, isLoading, error };
}

