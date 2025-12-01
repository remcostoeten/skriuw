import { pgTable, text, integer, bigint } from 'drizzle-orm/pg-core'

export const notes = pgTable('notes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  parentFolderId: text('parent_folder_id'),
  pinned: integer('pinned').default(0),
  pinnedAt: bigint('pinned_at', { mode: 'number' }),
  favorite: integer('favorite').default(0),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  type: text('type').notNull().default('note')
})

export const folders = pgTable('folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentFolderId: text('parent_folder_id'),
  pinned: integer('pinned').default(0),
  pinnedAt: bigint('pinned_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  type: text('type').notNull().default('folder')
})

export const settings = pgTable('settings', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
})

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  noteId: text('note_id').notNull(),
  blockId: text('block_id').notNull(),
  content: text('content').notNull(),
  checked: integer('checked').default(0).notNull(),
  parentTaskId: text('parent_task_id'),
  position: integer('position').default(0).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
})

export const shortcuts = pgTable('shortcuts', {
  id: text('id').primaryKey(),
  keys: text('keys').notNull(),
  customizedAt: bigint('customized_at', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
})

// Type exports for use in the app
export type Note = typeof notes.$inferSelect
export type NewNote = typeof notes.$inferInsert
export type Folder = typeof folders.$inferSelect
export type NewFolder = typeof folders.$inferInsert
export type Setting = typeof settings.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Shortcut = typeof shortcuts.$inferSelect
