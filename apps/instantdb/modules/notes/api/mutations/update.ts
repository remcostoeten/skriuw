import { useUpdate } from '@/hooks/core';

interface UpdateNoteInput {
  title?: string;
  content?: string;
}

export function useUpdateNote() {
  const { update, isLoading, error } = useUpdate('notes');

  const updateNote = async (id: string, input: UpdateNoteInput) => {
    return update(id, {
      ...input,
      updatedAt: Date.now(),
    });
  };

  return { updateNote, isLoading, error };
}

