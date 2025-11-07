import { transact, tx } from '@/api/db/client';
import { useMutation } from '@/hooks/core';
import { generateId } from 'utils';
import { TaskStatus, TaskPriority } from '@/types';
import { withTimestamps } from '@/shared/utilities/timestamps';

type props = {
  noteId?: UUID;
  projectId?: UUID;
  content: string;
} & Positionable & {
  priority?: TaskPriority;
  status?: TaskStatus;
  dueAt?: number;
  recurrence?: string;
  nextRunAt?: number;
  reminderAt?: number;
  parentId?: UUID;
  tags?: string[];
  dependsOnIds?: UUID[];
}

export function useCreateTask() {
  const { mutate, isLoading, error } = useMutation(async (input: props) => {
    const id: UUID = generateId();
    await transact([
      tx.tasks[id].update(withTimestamps({
        content: input.content,
        completed: false,
        status: input.status ?? TaskStatus.TODO,
        position: input.position,
        priority: input.priority ?? TaskPriority.MEDIUM,
        dueAt: input.dueAt,
        recurrence: input.recurrence,
        nextRunAt: input.nextRunAt,
        reminderAt: input.reminderAt,
        tags: input.tags && input.tags.length > 0 ? input.tags.join(',') : undefined,
      }, true)),
      ...(input.noteId ? [tx.tasks[id].link({ note: input.noteId })] : []),
      ...(input.projectId ? [tx.tasks[id].link({ project: input.projectId })] : []),
      ...(input.parentId ? [tx.tasks[id].link({ parent: input.parentId })] : []),
      ...((input.dependsOnIds ?? []).map(depId => tx.tasks[id].link({ dependsOn: depId }))),
    ]);
    return { id, ...input };
  });

  return { createTask: mutate, isLoading, error };
}

