import { i } from '@instantdb/react';

// Define the schema for notes and tasks
export const schema = i.graph(
  {
    notes: i.entity({
      title: i.string(),
      content: i.string(),
      createdAt: i.number(),
      updatedAt: i.number(),
    }),
    folders: i.entity({
      name: i.string(),
      createdAt: i.number(),
      updatedAt: i.number(),
      // Note: deletedAt handled at application level, not in schema
    }),
    tasks: i.entity({
      content: i.string(),
      completed: i.boolean(),
      position: i.number(),
      createdAt: i.number(),
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
  }
);

export type Schema = typeof schema;

// Infer types from schema
export type Note = {
  id: string;
  title: string;
  content: string;
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
  note?: Note;
};

export type Folder = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  parent?: Folder;
  children?: Folder[];
  notes?: Note[];
};

