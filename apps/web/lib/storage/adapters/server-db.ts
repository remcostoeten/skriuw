/**
 * Server-side database adapter for direct Drizzle access.
 * Single abstraction layer: API routes → this adapter → Drizzle
 * 
 * Supports user-scoped queries via userId parameter.
 */

import { getDatabase, notes, folders, tasks, settings, shortcuts, storageConnectors } from '@skriuw/db'
import { eq, inArray, and } from 'drizzle-orm'

type TableConfig = { table: any; jsonFields: string[]; hasUserId: boolean }

/**
 * Table configuration with user-scoping support.
 * hasUserId indicates if the table supports user-scoped queries.
 */
const TABLES: Record<string, TableConfig> = {
    notes: { table: notes, jsonFields: ['content'], hasUserId: true },
    folders: { table: folders, jsonFields: [], hasUserId: true },
    tasks: { table: tasks, jsonFields: [], hasUserId: true },
    settings: { table: settings, jsonFields: ['value'], hasUserId: true },
    shortcuts: { table: shortcuts, jsonFields: ['keys'], hasUserId: true },
    storageConnectors: { table: storageConnectors, jsonFields: ['config', 'oauth2Tokens'], hasUserId: true },
}

function serialize(data: any, jsonFields: string[]) {
    const result = { ...data }
    for (const field of jsonFields) {
        if (result[field] !== undefined && typeof result[field] !== 'string') {
            result[field] = JSON.stringify(result[field])
        }
    }
    if (result.pinned !== undefined) result.pinned = result.pinned ? 1 : 0
    if (result.favorite !== undefined) result.favorite = result.favorite ? 1 : 0
    return result
}

function deserialize(data: any, jsonFields: string[]) {
    const result = { ...data }
    for (const field of jsonFields) {
        if (result[field] && typeof result[field] === 'string') {
            try {
                result[field] = JSON.parse(result[field])
            } catch {
                /* keep as string */
            }
        }
    }
    if ('pinned' in result) result.pinned = result.pinned === 1
    if ('favorite' in result) result.favorite = result.favorite === 1
    return result
}

function getConfig(key: string): TableConfig {
    const config = TABLES[key]
    if (!config) throw new Error(`Unknown table: ${key}`)
    return config
}

/**
 * Creates a user-scoped where condition.
 * Returns a condition that filters by both id and userId, or just id if no userId.
 * 
 * @param table - The drizzle table
 * @param id - Entity ID
 * @param userId - Optional user ID for scoping
 * @param hasUserId - Whether the table supports user scoping
 */
function scopedIdCondition(table: any, id: string, userId?: string | null, hasUserId = true) {
    if (userId && hasUserId && table.userId) {
        return and(eq(table.id, id), eq(table.userId, userId))
    }
    return eq(table.id, id)
}

/**
 * Creates a user-scoped where condition for list queries.
 * 
 * @param table - The drizzle table
 * @param userId - Optional user ID for scoping
 * @param hasUserId - Whether the table supports user scoping
 */
function scopedUserCondition(table: any, userId?: string | null, hasUserId = true) {
    if (userId && hasUserId && table.userId) {
        return eq(table.userId, userId)
    }
    return undefined
}

export const db = {
    async create<T>(table: string, data: any, userId?: string | null): Promise<T> {
        const { table: t, jsonFields, hasUserId } = getConfig(table)
        const entityData = { ...data }

        // Attach userId if provided and table supports it
        if (userId && hasUserId) {
            entityData.userId = userId
        }

        const created = (await getDatabase()
            .insert(t)
            .values(serialize(entityData, jsonFields))
            .returning()) as any[]
        return deserialize(created[0], jsonFields) as T
    },

    async upsert<T>(table: string, data: any, userId?: string | null): Promise<T> {
        const { table: t, jsonFields, hasUserId } = getConfig(table)
        const entityData = { ...data }

        // Attach userId if provided and table supports it
        if (userId && hasUserId) {
            entityData.userId = userId
        }

        const serialized = serialize(entityData, jsonFields)
        const result = (await getDatabase()
            .insert(t)
            .values(serialized)
            .onConflictDoUpdate({ target: t.id, set: serialized })
            .returning()) as any[]
        return deserialize(result[0], jsonFields) as T
    },

    async findById<T>(table: string, id: string, userId?: string | null): Promise<T | null> {
        const { table: t, jsonFields, hasUserId } = getConfig(table)
        const condition = scopedIdCondition(t, id, userId, hasUserId)
        const result = (await getDatabase().select().from(t).where(condition)) as any[]
        return result[0] ? (deserialize(result[0], jsonFields) as T) : null
    },

    async findAll<T>(table: string, userId?: string | null): Promise<T[]> {
        const { table: t, jsonFields, hasUserId } = getConfig(table)
        const condition = scopedUserCondition(t, userId, hasUserId)

        let query = getDatabase().select().from(t)
        if (condition) {
            query = query.where(condition) as typeof query
        }

        const results = (await query) as any[]
        return results.map((r: any) => deserialize(r, jsonFields) as T)
    },

    async update<T>(table: string, id: string, data: any, userId?: string | null): Promise<T | null> {
        const { table: t, jsonFields, hasUserId } = getConfig(table)
        const condition = scopedIdCondition(t, id, userId, hasUserId)

        const updated = (await getDatabase()
            .update(t)
            .set(serialize(data, jsonFields))
            .where(condition)
            .returning()) as any[]
        return updated[0] ? (deserialize(updated[0], jsonFields) as T) : null
    },

    async delete(table: string, id: string, userId?: string | null): Promise<boolean> {
        const { table: t, hasUserId } = getConfig(table)
        const condition = scopedIdCondition(t, id, userId, hasUserId)

        if (table === 'notes') {
            // Also delete associated tasks when deleting a note
            await getDatabase().delete(tasks).where(eq(tasks.noteId, id))
        }

        const deleted = (await getDatabase().delete(t).where(condition).returning()) as any[]
        return deleted.length > 0
    },

    async deleteMany(table: string, ids: string[], userId?: string | null): Promise<number> {
        if (ids.length === 0) return 0
        const { table: t, hasUserId } = getConfig(table)

        let condition: any = inArray(t.id, ids)
        if (userId && hasUserId && t.userId) {
            condition = and(condition, eq(t.userId, userId))
        }

        const deleted = (await getDatabase().delete(t).where(condition).returning()) as any[]
        return deleted.length
    },

    async createMany<T>(table: string, items: any[], userId?: string | null): Promise<T[]> {
        if (items.length === 0) return []
        const { table: t, jsonFields, hasUserId } = getConfig(table)

        // Attach userId to all items if provided
        const itemsWithUser = items.map(item => {
            if (userId && hasUserId) {
                return { ...item, userId }
            }
            return item
        })

        const serialized = itemsWithUser.map((i) => serialize(i, jsonFields))
        const created = (await getDatabase().insert(t).values(serialized).returning()) as any[]
        return created.map((r: any) => deserialize(r, jsonFields) as T)
    },

    // Direct access for complex queries
    raw: getDatabase,
}

