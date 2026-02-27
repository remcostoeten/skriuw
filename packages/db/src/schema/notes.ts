import { pgTable, text, integer, bigint, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { createUserIndex, createUserCompositeIndex } from '../user-owned'
import { user } from './auth'

export const notes = pgTable(
    'notes',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        content: text('content').notNull(),
        coverImage: text('cover_image'),
        icon: text('icon'),
        tags: text('tags').array(),
        parentFolderId: text('parent_folder_id'),
        userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
        pinned: integer('pinned').default(0),
        pinnedAt: bigint('pinned_at', { mode: 'number' }),
        favorite: integer('favorite').default(0),
        isPublic: boolean('is_public').default(false).notNull(),
        publicId: text('public_id'),
        publicViews: integer('public_views').default(0).notNull(),
        deletedAt: bigint('deleted_at', { mode: 'number' }),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
        type: text('type').notNull().default('note')
    },
    (table) => ({
        parentFolderIdx: index('notes_parent_folder_idx').on(table.parentFolderId),
        deletedAtIdx: index('notes_deleted_at_idx').on(table.deletedAt),
        pinnedIdx: index('notes_pinned_idx').on(table.pinned),
        updatedAtIdx: index('notes_updated_at_idx').on(table.updatedAt),
        userIdx: createUserIndex('notes', table.userId),
        userParentIdx: createUserCompositeIndex(
            'notes',
            'parent',
            table.userId,
            table.parentFolderId
        ),
        publicIdIdx: uniqueIndex('notes_public_id_idx').on(table.publicId)
    })
)

export const folders = pgTable(
    'folders',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        parentFolderId: text('parent_folder_id'),
        userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
        pinned: integer('pinned').default(0),
        pinnedAt: bigint('pinned_at', { mode: 'number' }),
        deletedAt: bigint('deleted_at', { mode: 'number' }),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
        type: text('type').notNull().default('folder')
    },
    (table) => ({
        parentFolderIdx: index('folders_parent_folder_idx').on(table.parentFolderId),
        deletedAtIdx: index('folders_deleted_at_idx').on(table.deletedAt),
        userIdx: createUserIndex('folders', table.userId),
        userParentIdx: createUserCompositeIndex(
            'folders',
            'parent',
            table.userId,
            table.parentFolderId
        )
    })
)

export const noteVisitors = pgTable(
    'note_visitors',
    {
        id: text('id').primaryKey(),
        noteId: text('note_id')
            .notNull()
            .references(() => notes.id, { onDelete: 'cascade' }),
        visitorKey: text('visitor_key').notNull(),
        viewerUserId: text('viewer_user_id'),
        createdAt: bigint('created_at', { mode: 'number' }).notNull()
    },
    (table) => ({
        noteIdx: index('note_visitors_note_idx').on(table.noteId),
        noteVisitorIdx: uniqueIndex('note_visitors_note_visitor_idx').on(
            table.noteId,
            table.visitorKey
        ),
        visitorIdx: index('note_visitors_visitor_idx').on(table.visitorKey)
    })
)

export const tags = pgTable(
    'tags',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        color: text('color').default('#6366f1'),
        userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
    },
    (table) => ({
        userIdx: createUserIndex('tags', table.userId),
        userNameIdx: uniqueIndex('tags_user_name_idx').on(table.userId, table.name)
    })
)

export const noteTags = pgTable(
    'note_tags',
    {
        noteId: text('note_id')
            .notNull()
            .references(() => notes.id, { onDelete: 'cascade' }),
        tagId: text('tag_id')
            .notNull()
            .references(() => tags.id, { onDelete: 'cascade' })
    },
    (table) => ({
        pk: uniqueIndex('note_tags_pk').on(table.noteId, table.tagId),
        noteIdx: index('note_tags_note_idx').on(table.noteId),
        tagIdx: index('note_tags_tag_idx').on(table.tagId)
    })
)

export const files = pgTable(
    'files',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        url: text('url').notNull(),
        name: text('name').notNull(),
        originalName: text('original_name'),
        size: integer('size').notNull(),
        type: text('type').notNull(),
        storageProvider: text('storage_provider').notNull().default('uploadthing'),
        isPublic: boolean('is_public').default(false).notNull(),
        createdAt: bigint('created_at', { mode: 'number' }).notNull()
    },
    (table) => ({
        userIdx: createUserIndex('files', table.userId),
        createdIdx: index('files_created_at_idx').on(table.createdAt)
    })
)

export type Note = typeof notes.$inferSelect
export type NewNote = typeof notes.$inferInsert
export type Folder = typeof folders.$inferSelect
export type NewFolder = typeof folders.$inferInsert
export type NoteVisitor = typeof noteVisitors.$inferSelect
export type NewNoteVisitor = typeof noteVisitors.$inferInsert
export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert
export type NoteTag = typeof noteTags.$inferSelect
export type NewNoteTag = typeof noteTags.$inferInsert
export type File = typeof files.$inferSelect
export type NewFile = typeof files.$inferInsert
