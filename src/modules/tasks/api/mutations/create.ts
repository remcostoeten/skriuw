import { useMutation } from '@/hooks/core';
import { generateId } from '@/shared/utils';
import { transact, tx } from '@/api/db/client';

interface CreateTaskInput {
  noteId: string;
  content: string;
  position: number;
}

export function useCreateTask() {
  const { mutate, isLoading, error } = useMutation(async (input: CreateTaskInput) => {
    const id = generateId();
    const now = Date.now();
    await transact([
      tx.tasks[id].update({
        content: input.content,
        completed: false,
        position: input.position,
        createdAt: now,
      }),
      tx.tasks[id].link({ note: input.noteId }),
    ]);
    return { id, ...input };
  });

  return { createTask: mutate, isLoading, error };
}

