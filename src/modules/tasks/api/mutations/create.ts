import { transact, tx } from '@/api/db/client';
import { useMutation } from '@/hooks/core';
import { generateId } from 'utils';

type props = {
  noteId?: string;
  projectId?: string;
  content: string;
  position: number;
  priority?: 'low' | 'med' | 'high' | 'urgent';
  dueAt?: number;
  parentId?: string;
  tags?: string[];
  dependsOnIds?: string[];
}

export function useCreateTask() {
  const { mutate, isLoading, error } = useMutation(async (input: props) => {
    const id = generateId();
    const now = Date.now();
    await transact([
      tx.tasks[id].update({
        content: input.content,
        completed: false,
        status: 'todo',
        position: input.position,
        createdAt: now,
        priority: input.priority ?? 'med',
        dueAt: input.dueAt,
        tags: input.tags && input.tags.length > 0 ? input.tags.join(',') : undefined,
      }),
      ...(input.noteId ? [tx.tasks[id].link({ note: input.noteId })] : []),
      ...(input.projectId ? [tx.tasks[id].link({ project: input.projectId })] : []),
      ...(input.parentId ? [tx.tasks[id].link({ parent: input.parentId })] : []),
      ...((input.dependsOnIds ?? []).map(depId => tx.tasks[id].link({ dependsOn: depId }))),
    ]);
    return { id, ...input };
  });

  return { createTask: mutate, isLoading, error };
}

