import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Notes table - stores individual notes with BlockNote content
 */
export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  content: text('content').notNull(), // JSON stringified Block[]
  folderId: text('folder_id').references(() => folders.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  folderIdIdx: index('idx_notes_folder_id').on(table.folderId),
  updatedAtIdx: index('idx_notes_updated_at').on(table.updatedAt),
}));

/**
 * Folders table - stores folder hierarchy
 */
export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id').references(() => folders.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  parentIdIdx: index('idx_folders_parent_id').on(table.parentId),
  updatedAtIdx: index('idx_folders_updated_at').on(table.updatedAt),
}));

export type NoteRow = typeof notes.$inferSelect;
export type NoteInsert = typeof notes.$inferInsert;
export type FolderRow = typeof folders.$inferSelect;
export type FolderInsert = typeof folders.$inferInsert;

