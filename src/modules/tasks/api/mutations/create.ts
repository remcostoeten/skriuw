import { transact, tx } from '@/api/db/client';
import { useMutation } from '@/hooks/core';
import { generateId } from 'utils';
import { TaskStatus, TaskPriority, EntityId, Timestamp } from '@/types';

type CreateTaskInput = {
  noteId?: EntityId;
  projectId?: EntityId;
  content: string;
  position: number;
  priority?: TaskPriority;
  dueAt?: Timestamp;
  parentId?: EntityId;
  tags?: string[];
  dependsOnIds?: EntityId[];
}

export function useCreateTask() {
  const { mutate, isLoading, error } = useMutation(async (input: CreateTaskInput) => {
    const id: EntityId = generateId();
    const now: Timestamp = Date.now();
    await transact([
      tx.tasks[id].update({
        content: input.content,
        completed: false,
        status: TaskStatus.TODO,
        position: input.position,
        createdAt: now,
        priority: input.priority ?? TaskPriority.MEDIUM,
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

