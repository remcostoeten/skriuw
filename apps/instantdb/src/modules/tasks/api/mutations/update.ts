import { useMutation } from '@/hooks/core';
import { transact, tx } from '@/api/db/client';
import { withTimestamps } from '@/shared/utilities/timestamps';
import { updateRelation, updateManyRelation } from '@/shared/utilities/relations';

type UpdateTaskInput = {
  content?: string;
  completed?: boolean;
  position?: number;
  status?: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority?: 'low' | 'med' | 'high' | 'urgent';
  dueAt?: number;
  tags?: string[];
  recurrence?: string;
  nextRunAt?: number;
  reminderAt?: number;
  parentId?: Nullable<UUID>;
  dependsOnIds?: UUID[];
  projectId?: Nullable<UUID>;
};

export function useUpdateTask() {
  const { mutate, isLoading, error } = useMutation(async ({ id, input }: { id: UUID; input: Partial<UpdateTaskInput> }) => {
    const operations: any[] = [];
    
    // Build scalar update operations
    const scalarUpdates: any = {};
    if (input.content !== undefined) scalarUpdates.content = input.content;
    if (input.completed !== undefined) scalarUpdates.completed = input.completed;
    if (input.position !== undefined) scalarUpdates.position = input.position;
    if (input.status !== undefined) scalarUpdates.status = input.status;
    if (input.priority !== undefined) scalarUpdates.priority = input.priority;
    if (input.dueAt !== undefined) scalarUpdates.dueAt = input.dueAt;
    if (input.recurrence !== undefined) scalarUpdates.recurrence = input.recurrence;
    if (input.nextRunAt !== undefined) scalarUpdates.nextRunAt = input.nextRunAt;
    if (input.reminderAt !== undefined) scalarUpdates.reminderAt = input.reminderAt;
    if (input.tags !== undefined) {
      scalarUpdates.tags = Array.isArray(input.tags) ? input.tags.join(',') : input.tags;
    }
    
    // Add update operation with timestamps
    operations.push(tx.tasks[id].update(withTimestamps(scalarUpdates)));

    // Handle parent relationship
    if (input.parentId !== undefined) {
      operations.push(...updateRelation('tasks', id, 'parent', input.parentId));
    }

    // Handle dependsOn relationships
    if (input.dependsOnIds) {
      operations.push(...updateManyRelation('tasks', id, 'dependsOn', input.dependsOnIds));
    }

    // Handle project relationship
    if (input.projectId !== undefined) {
      operations.push(...updateRelation('tasks', id, 'project', input.projectId));
    }
    
    // Execute all operations in a single atomic transaction
    await transact(operations);
    return { id };
  });
  const updateTask = (id: UUID, input: UpdateTaskInput) => mutate({ id, input });
  return { updateTask, isLoading, error };
}

