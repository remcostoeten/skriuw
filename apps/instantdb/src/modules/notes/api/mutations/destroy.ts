import { useDestroy, useMutation } from '@/hooks/core';

export function useDestroyNote() {
  const { destroy } = useDestroy('notes');
  const { mutate, isLoading, error } = useMutation(async (id: string) => {
    await destroy(id);
    return { id };
  });

  return { destroyNote: mutate, isLoading, error };
}

