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
};

export type Task = {
  id: string;
  content: string;
  completed: boolean;
  position: number;
  createdAt: number;
  note?: Note;
};

