import { useMutation, useUpdate } from '@/hooks/core';

interface UpdateNoteInput {
  title?: string;
  content?: string;
  position?: number;
  pinned?: boolean;
}

export function useUpdateNote() {
  const { update } = useUpdate('notes');
  const { mutate, isLoading, error } = useMutation(async ({ id, input }: { id: string; input: UpdateNoteInput }) => {
    await update(id, { ...input, updatedAt: Date.now() });
    return { id };
  });

  const updateNote = (id: string, input: UpdateNoteInput) => mutate({ id, input });
  return { updateNote, isLoading, error };
}

