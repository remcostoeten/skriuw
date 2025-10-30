import { useMutation } from '@/hooks/core';
import { generateId } from '@/shared/utils';
import { transact, tx } from '@/api/db/client';

interface CreateTaskInput {
  noteId: string;
  content: string;
  position: number;
  status?: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority?: 'low' | 'med' | 'high' | 'urgent';
  dueAt?: number;
  parentId?: string;
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
        status: input.status ?? 'todo',
        priority: input.priority ?? 'med',
        dueAt: input.dueAt,
      }),
      tx.tasks[id].link({ note: input.noteId }),
      ...(input.parentId ? [tx.tasks[id].link({ parent: input.parentId })] : []),
    ]);
    return { id, ...input };
  });

  return { createTask: mutate, isLoading, error };
}

