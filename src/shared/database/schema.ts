import { pgTable, text, integer } from 'drizzle-orm/pg-core'

export const notes = pgTable('notes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  parentFolderId: text('parent_folder_id'),
  pinned: integer('pinned').default(0),
  pinnedAt: integer('pinned_at'),
  favorite: integer('favorite').default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  type: text('type').notNull().default('note')
})

export const folders = pgTable('folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentFolderId: text('parent_folder_id'),
  pinned: integer('pinned').default(0),
  pinnedAt: integer('pinned_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  type: text('type').notNull().default('folder')
})

export const settings = pgTable('settings', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull()
})
