import { pgTable, text, integer, boolean, bigint, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { createUserIndex, createUserCompositeIndex } from '../user-owned'
import { user } from './auth'

export const aiProviderConfig = pgTable(
    'ai_provider_config',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        provider: text('provider').notNull(),
        model: text('model').notNull(),
        basePrompt: text('base_prompt'),
        temperature: integer('temperature').default(70),
        isActive: boolean('is_active').default(true).notNull(),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
    },
    (table) => ({
        userActiveUniqueIdx: uniqueIndex('ai_provider_config_user_active_unique_idx').on(
            table.userId,
            table.isActive
        ),
        userIdx: createUserIndex('ai_provider_config', table.userId),
        userActiveIdx: createUserCompositeIndex(
            'ai_provider_config',
            'active',
            table.userId,
            table.isActive
        )
    })
)

export const aiPromptLog = pgTable(
    'ai_prompt_log',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        provider: text('provider').notNull(),
        model: text('model').notNull(),
        tokensUsed: integer('tokens_used'),
        promptHash: text('prompt_hash').notNull(),
        createdAt: bigint('created_at', { mode: 'number' }).notNull()
    },
    (table) => ({
        userIdx: createUserIndex('ai_prompt_log', table.userId),
        userCreatedIdx: createUserCompositeIndex(
            'ai_prompt_log',
            'created',
            table.userId,
            table.createdAt
        )
    })
)

export const aiApiKeys = pgTable(
    'ai_api_keys',
    {
        id: text('id').primaryKey(),
        provider: text('provider').notNull(),
        encryptedKey: text('encrypted_key').notNull(),
        priority: integer('priority').default(0).notNull(),
        usageCount: integer('usage_count').default(0).notNull(),
        lastUsedAt: bigint('last_used_at', { mode: 'number' }),
        rateLimitedUntil: bigint('rate_limited_until', { mode: 'number' }),
        isActive: boolean('is_active').default(true).notNull(),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        updatedAt: bigint('updated_at', { mode: 'number' }).notNull()
    },
    (table) => ({
        providerIdx: index('ai_api_keys_provider_idx').on(table.provider),
        providerActiveIdx: index('ai_api_keys_provider_active_idx').on(
            table.provider,
            table.isActive
        )
    })
)

export type AIProviderConfig = typeof aiProviderConfig.$inferSelect
export type NewAIProviderConfig = typeof aiProviderConfig.$inferInsert
export type AIPromptLog = typeof aiPromptLog.$inferSelect
export type NewAIPromptLog = typeof aiPromptLog.$inferInsert
export type AIApiKey = typeof aiApiKeys.$inferSelect
export type NewAIApiKey = typeof aiApiKeys.$inferInsert
