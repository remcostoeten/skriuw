import { useDestroy } from '@/hooks/core';

export function useDestroyNote() {
  const { destroy, isLoading, error } = useDestroy('notes');

  const destroyNote = async (id: string) => {
    return destroy(id);
  };

  return { destroyNote, isLoading, error };
}

