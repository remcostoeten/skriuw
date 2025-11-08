import type { Task } from '@/api/db/schema';
import { filterTasks, sortTasks, TaskFilter, TaskSort } from './sort-filter';

export type SavedList = {
    id: string;
    name: string;
    filter: TaskFilter;
    sort: TaskSort;
};

function startOfDay(ts: number = Date.now()): number {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function endOfDay(ts: number = Date.now()): number {
    const d = new Date(ts);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
}

function addDays(ts: number, days: number): number {
    return ts + days * 24 * 60 * 60 * 1000;
}

export const savedLists: SavedList[] = [
    {
        id: 'overdue',
        name: 'Overdue',
        filter: { dueBefore: startOfDay(), completed: false },
        sort: 'dueAt',
    },
    {
        id: 'blocked',
        name: 'Blocked',
        filter: { completed: false },
        sort: 'priority',
    },
    {
        id: 'today',
        name: 'Today',
        filter: { dueAfter: startOfDay(), dueBefore: endOfDay(), completed: false },
        sort: 'priority',
    },
    {
        id: 'this-week',
        name: 'This Week',
        filter: { dueAfter: startOfDay(), dueBefore: addDays(startOfDay(), 7), completed: false },
        sort: 'dueAt',
    },
];

// Optionally apply blocked detection if dependsOn tasks exist
export function isBlocked(task: Task): boolean {
    const deps = task.dependsOn ?? [];
    return deps.some((t) => !t.completed);
}

export function getList(listId: string) {
    return savedLists.find((l) => l.id === listId);
}

export function applyList(tasks: Task[], listId: string): Task[] {
    const list = getList(listId);
    if (!list) return tasks;
    let filtered = filterTasks(tasks, list.filter);
    if (listId === 'blocked') filtered = filtered.filter(isBlocked);
    return sortTasks(filtered, list.sort);
}


