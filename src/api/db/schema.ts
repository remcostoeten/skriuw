import { i } from '@instantdb/react';

export const schema = i.graph(
  {
    notes: i.entity({
      title: i.string(),
      content: i.string(),
      position: i.number(),
      createdAt: i.number(),
      updatedAt: i.number(),
    }),
    folders: i.entity({
      name: i.string(),
      position: i.number(),
      createdAt: i.number(),
      updatedAt: i.number(),
      // Note: deletedAt handled at application level, not in schema
    }),
    tasks: i.entity({
      content: i.string(),
      completed: i.boolean(),
      position: i.number(),
      createdAt: i.number(),
      priority: i.string(),
      dueAt: i.number().optional(),
    }),
  },
  {
    noteTasks: {
      forward: {
        on: 'tasks',
        has: 'one',
        label: 'note',
      },
      reverse: {
        on: 'notes',
        has: 'many',
        label: 'tasks',
      },
    },
    folderNotes: {
      forward: {
        on: 'notes',
        has: 'one',
        label: 'folder',
      },
      reverse: {
        on: 'folders',
        has: 'many',
        label: 'notes',
      },
    },
    parentFolders: {
      forward: {
        on: 'folders',
        has: 'one',
        label: 'parent',
      },
      reverse: {
        on: 'folders',
        has: 'many',
        label: 'children',
      },
    },
    parentTasks: {
      forward: {
        on: 'tasks',
        has: 'one',
        label: 'parent',
      },
      reverse: {
        on: 'tasks',
        has: 'many',
        label: 'subtasks',
      },
    },
  }
);

export type Schema = typeof schema;

export type Note = {
  id: string;
  title: string;
  content: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  tasks?: Task[];
  folder?: Folder;
};

export type Task = {
  id: string;
  content: string;
  completed: boolean;
  position: number;
  createdAt: number;
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority: 'low' | 'med' | 'high' | 'urgent';
  dueAt?: number;
  note?: Note;
  parent?: Task;
  subtasks?: Task[];
};

export type Folder = {
  id: string;
  name: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  parent?: Folder;
  children?: Folder[];
  notes?: Note[];
};

