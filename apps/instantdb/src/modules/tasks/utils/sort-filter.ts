import type { Task } from '@/api/db/schema';
import { TaskPriority } from '@/types';

export type TaskSort = 'priority' | 'dueAt' | 'position' | 'createdAt';
export type TaskFilter = {
    tags?: string[];
    priorities?: Array<Task['priority']>;
    dueBefore?: number;
    dueAfter?: number;
    completed?: boolean;
};

const priorityOrder: Record<TaskPriority, number> = {
    [TaskPriority.URGENT]: 0,
    [TaskPriority.HIGH]: 1,
    [TaskPriority.MEDIUM]: 2,
    [TaskPriority.LOW]: 3,
};

export function sortTasks(tasks: Task[], sort: TaskSort = 'position'): Task[] {
    const copy = [...tasks];
    switch (sort) {
        case 'priority':
            return copy.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
        case 'dueAt':
            return copy.sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
        case 'createdAt':
            return copy.sort((a, b) => a.createdAt - b.createdAt);
        case 'position':
        default:
            return copy.sort((a, b) => (a.position || 0) - (b.position || 0));
    }
}

export function filterTasks(tasks: Task[], filter: TaskFilter = {}): Task[] {
    return tasks.filter((t) => {
        if (filter.completed !== undefined && t.completed !== filter.completed) return false;
        if (filter.priorities && filter.priorities.length > 0 && !filter.priorities.includes(t.priority)) return false;
        if (filter.tags && filter.tags.length > 0) {
            const taskTags = t.tags ?? [];
            const hasAny = filter.tags.some(tag => taskTags.includes(tag));
            if (!hasAny) return false;
        }
        if (filter.dueBefore !== undefined) {
            if ((t.dueAt ?? Infinity) > filter.dueBefore) return false;
        }
        if (filter.dueAfter !== undefined) {
            if ((t.dueAt ?? -Infinity) < filter.dueAfter) return false;
        }
        return true;
    });
}


