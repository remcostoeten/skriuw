import { pgTable, text, bigint } from 'drizzle-orm/pg-core'
import { createUserIndex, createUserCompositeIndex } from '../user-owned'
import { user } from './auth'

export const storageConnectors = pgTable(
    'storage_connectors',
    {
        id: text('id').primaryKey(),
        userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
        type: text('type').notNull(),
        name: text('name').notNull(),
        status: text('status').notNull().default('configured'),
        config: text('config').notNull(),
        oauth2Tokens: text('oauth2_tokens'),
        lastValidatedAt: bigint('last_validated_at', { mode: 'number' }),
        lastError: text('last_error'),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
    },
    (table) => ({
        userIdx: createUserIndex('storage_connectors', table.userId),
        userTypeIdx: createUserCompositeIndex(
            'storage_connectors',
            'type',
            table.userId,
            table.type
        )
    })
)

export type StorageConnector = typeof storageConnectors.$inferSelect
export type NewStorageConnector = typeof storageConnectors.$inferInsert
