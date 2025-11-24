import { createClient } from '@libsql/client/web'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import type {
        BaseEntity,
        GenericStorageAdapter,
        LibsqlHttpOptions,
        ReadOptions,
        StorageAdapterType,
        StorageEvent,
        StorageEventListener,
        StorageInfo,
} from '../generic-types'

const storageRecords = sqliteTable('generic_storage_records', {
        storageKey: text('storage_key').primaryKey(),
        payload: text('payload').notNull(),
        updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

function findEntityById<T extends BaseEntity>(
        entities: T[],
        id: string,
        childrenKey?: keyof T
): T | undefined {
        for (const entity of entities) {
                if (entity.id === id) {
                        return entity
                }
                if (childrenKey && entity[childrenKey]) {
                        const children = entity[childrenKey] as unknown as T[]
                        if (Array.isArray(children)) {
                                const found = findEntityById(children, id, childrenKey)
                                if (found) return found
                        }
                }
        }
        return undefined
}

function getListeners() {
        const listeners: StorageEventListener[] = []

        return {
                add: (listener: StorageEventListener) => listeners.push(listener),
                remove: (listener: StorageEventListener) => {
                        const index = listeners.indexOf(listener)
                        if (index !== -1) {
                                listeners.splice(index, 1)
                        }
                },
                emit: (event: StorageEvent) => {
                        listeners.forEach(listener => {
                                try {
                                        listener(event)
                                } catch (error) {
                                        console.error('Error in storage event listener:', error)
                                }
                        })
                },
                clear: () => listeners.splice(0, listeners.length),
        }
}

export function createGenericDrizzleLibsqlHttpAdapter(options: LibsqlHttpOptions): GenericStorageAdapter {
        const adapterName = 'drizzle:libsql-http'
        const adapterType: StorageAdapterType = 'remote'

        const client = createClient({
                url: options.url,
                authToken: options.authToken,
        })
        const db = drizzle(client)
        const listeners = getListeners()

        async function getEntities<T extends BaseEntity>(storageKey: string): Promise<T[]> {
                const rows = await db.select().from(storageRecords).where(eq(storageRecords.storageKey, storageKey))
                if (!rows.length) return []

                try {
                        const parsed = JSON.parse(rows[0].payload)
                        if (Array.isArray(parsed)) return parsed
                        throw new Error('Invalid payload format')
                } catch (error) {
                        console.error(`Error parsing entities for ${storageKey}:`, error)
                        return []
                }
        }

        async function saveEntities<T extends BaseEntity>(storageKey: string, entities: T[]): Promise<void> {
                const payload = JSON.stringify(entities)
                const timestamp = Date.now()
                await db
                        .insert(storageRecords)
                        .values({ storageKey, payload, updatedAt: timestamp })
                        .onConflictDoUpdate({
                                target: storageRecords.storageKey,
                                set: { payload, updatedAt: timestamp },
                        })
        }

        const adapter: GenericStorageAdapter = {
                name: adapterName,
                type: adapterType,

                addEventListener(listener: StorageEventListener): void {
                        listeners.add(listener)
                },

                removeEventListener(listener: StorageEventListener): void {
                        listeners.remove(listener)
                },

                async initialize(): Promise<void> {
                        await client.execute(`
                                CREATE TABLE IF NOT EXISTS generic_storage_records (
                                        storage_key TEXT PRIMARY KEY,
                                        payload TEXT NOT NULL,
                                        updated_at INTEGER NOT NULL
                                )
                        `)
                },

                async destroy(): Promise<void> {
                        listeners.clear()
                        if ('close' in client && typeof client.close === 'function') {
                                try {
                                        await client.close()
                                } catch {
                                        // ignore
                                }
                        }
                },

                async isHealthy(): Promise<boolean> {
                        try {
                                await client.execute('SELECT 1')
                                return true
                        } catch (error) {
                                console.error('Health check failed for libsql adapter', error)
                                return false
                        }
                },

                async getStorageInfo(): Promise<StorageInfo> {
                        const rows = await db.select().from(storageRecords)
                        let totalItems = 0
                        let totalSize = 0

                        for (const row of rows) {
                                totalSize += row.payload.length * 2
                                try {
                                        const parsed = JSON.parse(row.payload)
                                        if (Array.isArray(parsed)) totalItems += parsed.length
                                } catch {
                                        // ignore parsing errors for size calculation
                                }
                        }

                        return {
                                adapter: adapterName,
                                type: adapterType,
                                totalItems,
                                sizeBytes: totalSize,
                                isOnline: true,
                                capabilities: {
                                        realtime: false,
                                        offline: false,
                                        sync: true,
                                        backup: true,
                                        versioning: false,
                                        collaboration: false,
                                },
                        }
                },

                async create<T extends BaseEntity>(
                        storageKey: string,
                        data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
                ): Promise<T> {
                        const entities = await getEntities<T>(storageKey)
                        const now = Date.now()
                        const id = data.id || `${storageKey}-${now}-${Math.random().toString(36).substr(2, 9)}`

                        const newEntity: T = {
                                ...data,
                                id,
                                createdAt: now,
                                updatedAt: now,
                        } as T

                        const parentId = (data as any).parentFolderId
                        if (parentId) {
                                const parent = findEntityById(entities, parentId, 'children' as keyof T)
                                if (parent && 'children' in parent) {
                                        const children = (parent as any).children
                                        if (Array.isArray(children)) {
                                                children.push(newEntity)
                                                await saveEntities(storageKey, entities)
                                                listeners.emit({ type: 'created', storageKey, entityId: id, data: newEntity })
                                                return newEntity
                                        }
                                }
                        }

                        entities.push(newEntity)
                        await saveEntities(storageKey, entities)
                        listeners.emit({ type: 'created', storageKey, entityId: id, data: newEntity })
                        return newEntity
                },

                async read<T extends BaseEntity>(
                        storageKey: string,
                        options?: ReadOptions
                ): Promise<T[] | T | undefined> {
                        const entities = await getEntities<T>(storageKey)

                        if (options?.getById) {
                                const entity = findEntityById(entities, options.getById, 'children' as keyof T)
                                if (!entity) return undefined
                                if (options.filter && !options.filter(entity as T)) return undefined
                                return entity
                        }

                        let result: T[] = entities
                        if (options?.filter) {
                                result = result.filter(options.filter)
                        }
                        if (options?.sort) {
                                result = result.sort(options.sort)
                        }
                        return result
                },

                async update<T extends BaseEntity>(
                        storageKey: string,
                        id: string,
                        data: Partial<T>
                ): Promise<T | undefined> {
                        const entities = await getEntities<T>(storageKey)
                        const entity = findEntityById(entities, id, 'children' as keyof T)
                        if (!entity) return undefined

                        const updatedEntity: T = {
                                ...entity,
                                ...data,
                                id: entity.id,
                                updatedAt: Date.now(),
                        } as T

                        const updateRecursive = (items: T[]): boolean => {
                                const index = items.findIndex(item => item.id === id)
                                if (index !== -1) {
                                        items[index] = updatedEntity
                                        return true
                                }
                                for (const item of items) {
                                        if ('children' in item && Array.isArray((item as any).children)) {
                                                if (updateRecursive((item as any).children)) return true
                                        }
                                }
                                return false
                        }

                        updateRecursive(entities)
                        await saveEntities(storageKey, entities)
                        listeners.emit({ type: 'updated', storageKey, entityId: id, data: updatedEntity })
                        return updatedEntity
                },

                async delete(storageKey: string, id: string): Promise<boolean> {
                        const entities = await getEntities<BaseEntity>(storageKey)

                        const deleteRecursive = (items: BaseEntity[], childrenKey?: keyof BaseEntity): boolean => {
                                const index = items.findIndex(item => item.id === id)
                                if (index !== -1) {
                                        items.splice(index, 1)
                                        return true
                                }
                                if (childrenKey) {
                                        for (const item of items) {
                                                const children = item[childrenKey] as unknown as BaseEntity[]
                                                if (Array.isArray(children) && deleteRecursive(children, childrenKey)) {
                                                        return true
                                                }
                                        }
                                }
                                return false
                        }

                        const found = deleteRecursive(entities, 'children' as keyof BaseEntity)
                        if (found) {
                                await saveEntities(storageKey, entities)
                                listeners.emit({ type: 'deleted', storageKey, entityId: id })
                        }
                        return found
                },

                async list<T extends BaseEntity>(storageKey: string): Promise<T[]> {
                        return getEntities<T>(storageKey)
                },

                async move<T extends BaseEntity>(
                        storageKey: string,
                        entityId: string,
                        targetParentId: string | null
                ): Promise<boolean> {
                        const entities = await getEntities<T>(storageKey)
                        const entity = findEntityById(entities, entityId, 'children' as keyof T)
                        if (!entity) return false

                        const removeRecursive = (items: T[]): boolean => {
                                const index = items.findIndex(item => item.id === entityId)
                                if (index !== -1) {
                                        items.splice(index, 1)
                                        return true
                                }
                                for (const item of items) {
                                        if ('children' in item && Array.isArray((item as any).children)) {
                                                if (removeRecursive((item as any).children)) return true
                                        }
                                }
                                return false
                        }

                        if (!removeRecursive(entities)) return false

                        const updatedEntity = { ...entity } as T
                        if ('parentFolderId' in updatedEntity) {
                                (updatedEntity as any).parentFolderId = targetParentId ?? undefined
                        }
                        updatedEntity.updatedAt = Date.now()

                        if (targetParentId) {
                                const targetParent = findEntityById(entities, targetParentId, 'children' as keyof T)
                                if (targetParent && 'children' in targetParent) {
                                        const children = (targetParent as any).children
                                        if (Array.isArray(children)) {
                                                children.push(updatedEntity)
                                        } else {
                                                entities.push(updatedEntity)
                                        }
                                } else {
                                        entities.push(updatedEntity)
                                }
                        } else {
                                entities.push(updatedEntity)
                        }

                        await saveEntities(storageKey, entities)
                        listeners.emit({ type: 'updated', storageKey, entityId, data: updatedEntity })
                        return true
                },
        }

        return adapter
}
