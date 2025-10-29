import { useCreate } from '@/hooks/core';
import { generateId } from '@/lib/utils';

interface CreateNoteInput {
  title: string;
  content: string;
}

export function useCreateNote() {
  const { create, isLoading, error } = useCreate('notes');

  const createNote = async (input: CreateNoteInput) => {
    const id = generateId();
    const now = Date.now();

    return create(id, {
      ...input,
      createdAt: now,
      updatedAt: now,
    });
  };

  return { createNote, isLoading, error };
}

