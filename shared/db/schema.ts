import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  folderId: text('folder_id').references(() => folders.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id').references(() => folders.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const notesFolderIdIdx = index('idx_notes_folder_id').on(notes.folderId);
export const notesUpdatedAtIdx = index('idx_notes_updated_at').on(notes.updatedAt);
export const foldersParentIdIdx = index('idx_folders_parent_id').on(folders.parentId);
export const foldersUpdatedAtIdx = index('idx_folders_updated_at').on(folders.updatedAt);

export type NoteRow = typeof notes.$inferSelect;
export type NoteInsert = typeof notes.$inferInsert;
export type FolderRow = typeof folders.$inferSelect;
export type FolderInsert = typeof folders.$inferInsert;

