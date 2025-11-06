import { useCreate, useMutation } from '@/hooks/core';
import { generateId } from 'utils';
import { withTimestamps } from '@/shared/utilities/timestamps';

type props = {
  title: string;
  content: string;
} & Positionable;

export function useCreateNote() {
  const { create } = useCreate('notes');
  const { mutate, isLoading, error } = useMutation(async (input: props) => {
    const id = generateId();
    await create(id, withTimestamps(input, true));
    return { id, ...input };
  });

  return { createNote: mutate, isLoading, error };
}

