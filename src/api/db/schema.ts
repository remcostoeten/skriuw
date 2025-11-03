import { i } from '@instantdb/react';

export const schema = i.graph(
  {
    notes: i.entity({
      title: i.string(),
      content: i.string(),
      position: i.number(),
      pinned: i.boolean().optional(),
      createdAt: i.number().indexed(),
      updatedAt: i.number(),
    }),
    folders: i.entity({
      name: i.string(),
      position: i.number(),
      createdAt: i.number().indexed(),
      updatedAt: i.number(),
      deletedAt: i.number().optional(),
    }),
    tasks: i.entity({
      content: i.string(),
      completed: i.boolean(),
      status: i.string(),
      position: i.number().indexed(),
      createdAt: i.number().indexed(),
      priority: i.string(),
      dueAt: i.number().optional(),
      // Store tags as a comma-separated string for simplicity
      tags: i.string().optional(),
      // Recurrence rule in iCal RRULE-like string (e.g., FREQ=WEEKLY;BYDAY=MO)
      recurrence: i.string().optional(),
      // Next scheduled run (epoch ms)
      nextRunAt: i.number().optional(),
      // Reminder timestamp (epoch ms)
      reminderAt: i.number().optional(),
    }),
    projects: i.entity({
      title: i.string(),
      scope: i.string().optional(),
      description: i.string().optional(),
      status: i.string(), // active|completed|archived
      position: i.number().indexed(),
      createdAt: i.number().indexed(),
      updatedAt: i.number(),
    }),
    comments: i.entity({
      body: i.string(),
      createdAt: i.number().indexed(),
    }),
    activity: i.entity({
      type: i.string(), // created|updated|status_changed|comment_added|completed|reopened
      message: i.string(),
      createdAt: i.number().indexed(),
      // optional key/value to store field deltas as JSON string
      meta: i.string().optional(),
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
    taskDependencies: {
      forward: {
        on: 'tasks',
        has: 'many',
        label: 'dependsOn',
      },
      reverse: {
        on: 'tasks',
        has: 'many',
        label: 'dependents',
      },
    },
    taskComments: {
      forward: {
        on: 'tasks',
        has: 'many',
        label: 'comments',
      },
      reverse: {
        on: 'comments',
        has: 'one',
        label: 'task',
      },
    },
    taskActivity: {
      forward: {
        on: 'tasks',
        has: 'many',
        label: 'activity',
      },
      reverse: {
        on: 'activity',
        has: 'one',
        label: 'task',
      },
    },
    projectTasks: {
      forward: {
        on: 'tasks',
        has: 'one',
        label: 'project',
      },
      reverse: {
        on: 'projects',
        has: 'many',
        label: 'tasks',
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
  pinned?: boolean;
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
  tags?: string | string[];
  recurrence?: string;
  nextRunAt?: number;
  reminderAt?: number;
  note?: Note;
  project?: Project;
  parent?: Task;
  subtasks?: Task[];
  dependsOn?: Task[];
  dependents?: Task[];
  comments?: Comment[];
  activity?: Activity[];
};

export type Project = {
  id: string;
  title: string;
  scope?: string;
  description?: string;
  status: 'active' | 'completed' | 'archived';
  position: number;
  createdAt: number;
  updatedAt: number;
  tasks?: Task[];
};

export type Comment = {
  id: string;
  body: string;
  createdAt: number;
  task?: Task;
};

export type Activity = {
  id: string;
  type: string;
  message: string;
  createdAt: number;
  meta?: string;
  task?: Task;
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

