import { pgTable, text, bigint, index } from 'drizzle-orm/pg-core'
import { createUserIndex, createUserCompositeIndex } from '../user-owned'
import { user } from './auth'

export const settings = pgTable(
    'settings',
    {
        id: text('id').primaryKey(),
        key: text('key').notNull().unique(),
        value: text('value').notNull(),
        userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
    },
    (table) => ({
        keyIdx: index('settings_key_idx').on(table.key),
        userIdx: createUserIndex('settings', table.userId),
        userKeyIdx: createUserCompositeIndex('settings', 'key', table.userId, table.key)
    })
)

export const shortcuts = pgTable(
    'shortcuts',
    {
        id: text('id').primaryKey(),
        keys: text('keys').notNull(),
        userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
        customizedAt: bigint('customized_at', { mode: 'number' }).notNull(),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
    },
    (table) => ({
        userIdx: createUserIndex('shortcuts', table.userId)
    })
)

export type Setting = typeof settings.$inferSelect
export type Shortcut = typeof shortcuts.$inferSelect
