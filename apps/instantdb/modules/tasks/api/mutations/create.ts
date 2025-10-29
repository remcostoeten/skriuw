import { useCreate } from '@/hooks/core';
import { generateId } from '@/lib/utils';
import { transact, tx } from '@/lib/db/client';

interface CreateTaskInput {
  noteId: string;
  content: string;
  position: number;
}

export function useCreateTask() {
  const { isLoading, error } = useCreate('tasks');

  const createTask = async (input: CreateTaskInput) => {
    const id = generateId();
    const now = Date.now();

    // Create task and link to note
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
  };

  return { createTask, isLoading, error };
}

