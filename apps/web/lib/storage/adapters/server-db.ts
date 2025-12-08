/**
 * Server-side database adapter for direct Drizzle access.
 * Single abstraction layer: API routes → this adapter → Drizzle
 */

import { getDatabase, notes, folders, tasks, settings, shortcuts } from '@skriuw/db'
import { eq, inArray } from 'drizzle-orm'

type TableConfig = { table: any; jsonFields: string[] }

const TABLES: Record<string, TableConfig> = {
    notes: { table: notes, jsonFields: ['content'] },
    folders: { table: folders, jsonFields: [] },
    tasks: { table: tasks, jsonFields: [] },
    settings: { table: settings, jsonFields: ['value'] },
    shortcuts: { table: shortcuts, jsonFields: ['keys'] },
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

export const db = {
    async create<T>(table: string, data: any): Promise<T> {
        const { table: t, jsonFields } = getConfig(table)
        const created = (await getDatabase()
            .insert(t)
            .values(serialize(data, jsonFields))
            .returning()) as any[]
        return deserialize(created[0], jsonFields) as T
    },

    async upsert<T>(table: string, data: any): Promise<T> {
        const { table: t, jsonFields } = getConfig(table)
        const serialized = serialize(data, jsonFields)
        const result = (await getDatabase()
            .insert(t)
            .values(serialized)
            .onConflictDoUpdate({ target: t.id, set: serialized })
            .returning()) as any[]
        return deserialize(result[0], jsonFields) as T
    },

    async findById<T>(table: string, id: string): Promise<T | null> {
        const { table: t, jsonFields } = getConfig(table)
        const result = (await getDatabase().select().from(t).where(eq(t.id, id))) as any[]
        return result[0] ? (deserialize(result[0], jsonFields) as T) : null
    },

    async findAll<T>(table: string): Promise<T[]> {
        const { table: t, jsonFields } = getConfig(table)
        const results = (await getDatabase().select().from(t)) as any[]
        return results.map((r: any) => deserialize(r, jsonFields) as T)
    },

    async update<T>(table: string, id: string, data: any): Promise<T | null> {
        const { table: t, jsonFields } = getConfig(table)
        const updated = (await getDatabase()
            .update(t)
            .set(serialize(data, jsonFields))
            .where(eq(t.id, id))
            .returning()) as any[]
        return updated[0] ? (deserialize(updated[0], jsonFields) as T) : null
    },

    async delete(table: string, id: string): Promise<boolean> {
        const { table: t } = getConfig(table)
        if (table === 'notes') {
            await getDatabase().delete(tasks).where(eq(tasks.noteId, id))
        }
        const deleted = (await getDatabase().delete(t).where(eq(t.id, id)).returning()) as any[]
        return deleted.length > 0
    },

    async deleteMany(table: string, ids: string[]): Promise<number> {
        if (ids.length === 0) return 0
        const { table: t } = getConfig(table)
        const deleted = (await getDatabase().delete(t).where(inArray(t.id, ids)).returning()) as any[]
        return deleted.length
    },

    async createMany<T>(table: string, items: any[]): Promise<T[]> {
        if (items.length === 0) return []
        const { table: t, jsonFields } = getConfig(table)
        const serialized = items.map((i) => serialize(i, jsonFields))
        const created = (await getDatabase().insert(t).values(serialized).returning()) as any[]
        return created.map((r: any) => deserialize(r, jsonFields) as T)
    },

    // Direct access for complex queries
    raw: getDatabase,
}
