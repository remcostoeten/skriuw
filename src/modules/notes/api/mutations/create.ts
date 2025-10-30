import { useCreate, useMutation } from '@/hooks/core';
import { generateId } from '@/shared/utils';

type props = {
  title: string;
  content: string;
  position: number;
}

export function useCreateNote() {
  const { create } = useCreate('notes');
  const { mutate, isLoading, error } = useMutation(async (input: props) => {
    const id = generateId();
    const now = Date.now();
    await create(id, { ...input, createdAt: now, updatedAt: now });
    return { id, ...input };
  });

  return { createNote: mutate, isLoading, error };
}

