import { i } from '@instantdb/react';
import {
  EntityId,
  Timestamp,
  Timestamps,
  TimestampedEntity,
  Positionable,
  IdentifiableEntity,
  BaseEntity,
  TaskStatus,
  TaskPriority,
  ProjectStatus,
  ActivityType,
  Tags
} from '../../types';

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
    userSettings: i.entity({
      key: i.string().indexed(),
      value: i.any(),
      createdAt: i.number().indexed(),
      updatedAt: i.number(),
    }),
    shortcuts: i.entity({
      action: i.string().indexed(),
      combo: i.string(),
      description: i.string(),
      enabled: i.boolean(),
      global: i.boolean(),
      createdAt: i.number().indexed(),
      updatedAt: i.number(),
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

export type Note = BaseEntity & {
  title: string;
  content: string;
  position: number;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
  tasks?: Task[];
  folder?: Folder;
};

export type Task = BaseEntity & {
  content: string;
  completed: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: Timestamp;
  tags?: Tags;
  recurrence?: string;
  nextRunAt?: Timestamp;
  reminderAt?: Timestamp;
  note?: Note;
  project?: Project;
  parent?: Task;
  subtasks?: Task[];
  dependsOn?: Task[];
  dependents?: Task[];
  comments?: Comment[];
  activity?: Activity[];
};

export type Project = BaseEntity & {
  title: string;
  scope?: string;
  description?: string;
  status: ProjectStatus;
  tasks?: Task[];
};

export type Comment = TimestampedEntity & IdentifiableEntity & {
  body: string;
  task?: Task;
};

export type Activity = TimestampedEntity & IdentifiableEntity & {
  type: ActivityType;
  message: string;
  meta?: string;
  task?: Task;
};

export type Folder = Timestamps & Positionable & {
  id: EntityId;
  name: string;
  parent?: Folder;
  children?: Folder[];
  notes?: Note[];
};

export type UserSetting = {
  id: string;
  key: string;
  value: any;
  createdAt: number;
  updatedAt: number;
};

export type Shortcut = BaseEntity & {
  action: string;
  combo: string;
  description: string;
  enabled: boolean;
  global: boolean;
  createdAt: number;
  updatedAt: number;
};

