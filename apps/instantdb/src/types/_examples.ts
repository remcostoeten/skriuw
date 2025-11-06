// Examples of how to use the new semantic types

import {
  EntityId,
  Timestamp,
  Timestamps,
  Positionable,
  BaseEntity,
  TaskStatus,
  TaskPriority,
  ProjectStatus,
  ActivityType,
  Tags
} from './index';

// Example: Creating a new task with proper typing
function createNewTask(): BaseEntity & {
  content: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags?: Tags;
} {
  return {
    id: 'task-123' as EntityId,
    content: 'Review semantic types implementation',
    position: 1,
    createdAt: Date.now() as Timestamp,
    updatedAt: Date.now() as Timestamp,
    status: TaskStatus.TODO,
    priority: TaskPriority.HIGH,
    tags: ['typescript', 'refactoring'] as Tags
  };
}

// Example: Function that works with timestamps
function isRecentlyUpdated(entity: Timestamps, threshold: number = 24 * 60 * 60 * 1000): boolean {
  const now: Timestamp = Date.now();
  const timeDiff = now - entity.updatedAt;
  return timeDiff < threshold;
}

// Example: Function that works with positionable entities
function sortByPosition<T extends Positionable>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

// Example: Function that validates task status transitions
function canChangeStatus(from: TaskStatus, to: TaskStatus): boolean {
  const validTransitions: Record<TaskStatus, TaskStatus[]> = {
    [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
    [TaskStatus.IN_PROGRESS]: [TaskStatus.DONE, TaskStatus.BLOCKED],
    [TaskStatus.BLOCKED]: [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
    [TaskStatus.DONE]: [TaskStatus.TODO] // Allow reopening
  };

  return validTransitions[from].includes(to);
}