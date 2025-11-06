import { useMutation, useUpdate } from '@/hooks/core';
import { withTimestamps } from '@/shared/utilities/timestamps';

type props = {
  title?: string;
  content?: string;
  position?: number;
  pinned?: boolean;
}

export function useUpdateNote() {
  const { update } = useUpdate('notes');
  const { mutate, isLoading, error } = useMutation(async ({ id, input }: { id: UUID; input: props }) => {
    await update(id, withTimestamps(input));
    return { id };
  });

  const updateNote = (id: UUID, input: props) => mutate({ id, input });
  return { updateNote, isLoading, error };
}

