import { pgTable, text, integer, bigint, index } from 'drizzle-orm/pg-core'

export const seedTemplateFolders = pgTable(
    'seed_template_folders',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        parentFolderId: text('parent_folder_id'),
        order: integer('order').default(0).notNull(),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
    },
    (table) => ({
        parentFolderIdx: index('seed_folders_parent_idx').on(table.parentFolderId),
        orderIdx: index('seed_folders_order_idx').on(table.order)
    })
)

export const seedTemplateNotes = pgTable(
    'seed_template_notes',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        content: text('content').notNull(),
        parentFolderId: text('parent_folder_id'),
        pinned: integer('pinned').default(0),
        order: integer('order').default(0).notNull(),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
    },
    (table) => ({
        parentFolderIdx: index('seed_notes_parent_idx').on(table.parentFolderId),
        orderIdx: index('seed_notes_order_idx').on(table.order)
    })
)

export type SeedTemplateFolder = typeof seedTemplateFolders.$inferSelect
export type NewSeedTemplateFolder = typeof seedTemplateFolders.$inferInsert
export type SeedTemplateNote = typeof seedTemplateNotes.$inferSelect
export type NewSeedTemplateNote = typeof seedTemplateNotes.$inferInsert
