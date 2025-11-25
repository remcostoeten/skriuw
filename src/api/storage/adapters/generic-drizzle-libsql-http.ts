import { createClient } from "@libsql/client/web";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { Item } from "@/features/notes/types";
import * as schema from "@/data/drizzle/base-entities";
import {
        NOTE_STORAGE_KEY,
        createFolderRecordDb,
        createNoteRecordDb,
        deleteItemRecordDb,
        getItemByIdDb,
        readNoteEntitiesDb,
        renameItemRecordDb,
        updateNoteRecordDb,
        moveItemRecordDb
} from "@/data/drizzle/note-storage";

import type {
        BaseEntity,
        GenericStorageAdapter,
        LibsqlHttpOptions,
        ReadOptions,
        StorageAdapterType,
        StorageEvent,
        StorageEventListener,
        StorageInfo
} from "../generic-types";

const storageRecords = sqliteTable("generic_storage_records", {
        storageKey: text("storage_key").primaryKey(),
        payload: text("payload").notNull(),
        updatedAt: integer("updated_at", { mode: "number" }).notNull()
});

function createListenerRegistry() {
        const listeners: StorageEventListener[] = [];

        return {
                add: (listener: StorageEventListener) => listeners.push(listener),
                remove: (listener: StorageEventListener) => {
                        const index = listeners.indexOf(listener);
                        if (index !== -1) listeners.splice(index, 1);
                },
                emit: (event: StorageEvent) => {
                        listeners.forEach(listener => {
                                try {
                                        listener(event);
                                } catch (error) {
                                        console.error("Error in storage event listener:", error);
                                }
                        });
                },
                clear: () => listeners.splice(0, listeners.length)
        };
}

function toNoteReadOptions(options?: ReadOptions) {
        if (!options) return undefined;
        return {
                getById: options.getById,
                filter: options.filter as ((item: Item) => boolean) | undefined,
                sort: options.sort as ((a: Item, b: Item) => number) | undefined
        };
}

function getNow(): number {
        return Date.now();
}

async function getGenericEntities<T extends BaseEntity>(
        db: LibSQLDatabase<typeof schema>,
        storageKey: string
): Promise<T[]> {
        const rows = await db.select().from(storageRecords).where(eq(storageRecords.storageKey, storageKey));
        if (!rows.length) return [];

        try {
                const parsed = JSON.parse(rows[0].payload);
                return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
                console.error(`Error parsing entities for ${storageKey}:`, error);
                return [];
        }
}

async function saveGenericEntities<T extends BaseEntity>(
        db: LibSQLDatabase<typeof schema>,
        storageKey: string,
        entities: T[]
): Promise<void> {
        const payload = JSON.stringify(entities);
        const timestamp = getNow();
        await db
                .insert(storageRecords)
                .values({ storageKey, payload, updatedAt: timestamp })
                .onConflictDoUpdate({
                        target: storageRecords.storageKey,
                        set: { payload, updatedAt: timestamp }
                });
}

export function createGenericDrizzleLibsqlHttpAdapter(options: LibsqlHttpOptions): GenericStorageAdapter {
        const adapterName = "drizzle:libsql-http";
        const adapterType: StorageAdapterType = "remote";

        const client = createClient({
                url: options.url,
                authToken: options.authToken
        });
        const db = drizzle(client, { schema });
        const listeners = createListenerRegistry();

        async function ensureTables(): Promise<void> {
                await client.execute(`
                        CREATE TABLE IF NOT EXISTS generic_storage_records (
                                storage_key TEXT PRIMARY KEY,
                                payload TEXT NOT NULL,
                                updated_at INTEGER NOT NULL
                        )
                `);
        }

        const adapter: GenericStorageAdapter = {
                name: adapterName,
                type: adapterType,

                addEventListener(listener: StorageEventListener): void {
                        listeners.add(listener);
                },

                removeEventListener(listener: StorageEventListener): void {
                        listeners.remove(listener);
                },

                async initialize(): Promise<void> {
                        await ensureTables();
                },

                async destroy(): Promise<void> {
                        listeners.clear();
                        if ("close" in client && typeof client.close === "function") {
                                await client.close();
                        }
                },

                async isHealthy(): Promise<boolean> {
                        try {
                                await client.execute("SELECT 1");
                                return true;
                        } catch (error) {
                                console.error("Health check failed for libsql adapter", error);
                                return false;
                        }
                },

                async getStorageInfo(): Promise<StorageInfo> {
                        const [noteRows, folderRows, genericRows] = await Promise.all([
                                db.select({ id: schema.notes.id }).from(schema.notes),
                                db.select({ id: schema.folders.id }).from(schema.folders),
                                db.select().from(storageRecords)
                        ]);

                        let genericSize = 0;
                        let genericItems = 0;
                        for (const row of genericRows) {
                                genericSize += row.payload.length * 2;
                                try {
                                        const parsed = JSON.parse(row.payload);
                                        if (Array.isArray(parsed)) genericItems += parsed.length;
                                } catch {
                                        // ignore payload parsing errors
                                }
                        }

                        return {
                                adapter: adapterName,
                                type: adapterType,
                                totalItems: noteRows.length + folderRows.length + genericItems,
                                sizeBytes: genericSize,
                                isOnline: true,
                                capabilities: {
                                        realtime: false,
                                        offline: false,
                                        sync: true,
                                        backup: true,
                                        versioning: true,
                                        collaboration: false
                                }
                        };
                },

                async create<T extends BaseEntity>(
                        storageKey: string,
                        data: Omit<T, "id" | "createdAt" | "updatedAt"> & { id?: string }
                ): Promise<T> {
                        if (storageKey === NOTE_STORAGE_KEY) {
                                const payload = data as unknown as Item;

                                if (payload.type === "folder") {
                                        const folder = await createFolderRecordDb(db, {
                                                name: payload.name,
                                                parentFolderId: (payload as any).parentFolderId
                                        });
                                        listeners.emit({ type: "created", storageKey, entityId: folder.id, data: folder });
                                        return folder as T;
                                }

                                const note = await createNoteRecordDb(db, {
                                        name: payload.name,
                                        content: (payload as any).content,
                                        parentFolderId: (payload as any).parentFolderId
                                });
                                listeners.emit({ type: "created", storageKey, entityId: note.id, data: note });
                                return note as T;
                        }

                        const entities = await getGenericEntities<T>(db, storageKey);
                        const now = getNow();
                        const id = data.id ?? `${storageKey}-${now}-${Math.random().toString(36).slice(2)}`;
                        const newEntity = {
                                ...data,
                                id,
                                createdAt: now,
                                updatedAt: now
                        } as T;
                        entities.push(newEntity);
                        await saveGenericEntities(db, storageKey, entities);
                        listeners.emit({ type: "created", storageKey, entityId: id, data: newEntity });
                        return newEntity;
                },

                async read<T extends BaseEntity>(
                        storageKey: string,
                        options?: ReadOptions
                ): Promise<T[] | T | undefined> {
                        if (storageKey === NOTE_STORAGE_KEY) {
                                return readNoteEntitiesDb(db, toNoteReadOptions(options)) as Promise<T[] | T | undefined>;
                        }

                        const entities = await getGenericEntities<T>(db, storageKey);
                        if (options?.getById) {
                                return entities.find(entity => entity.id === options.getById);
                        }

                        let result = entities;
                        if (options?.filter) {
                                result = result.filter(entity => options.filter?.(entity));
                        }
                        if (options?.sort) {
                                result = [...result].sort(options.sort);
                        }
                        return options?.getAll ? result : result.slice();
                },

                async update<T extends BaseEntity>(storageKey: string, id: string, data: Partial<T>) {
                        if (storageKey === NOTE_STORAGE_KEY) {
                                const existing = await getItemByIdDb(db, id);
                                if (!existing) return undefined;

                                if (existing.type === "note") {
                                        const updated = await updateNoteRecordDb(db, id, {
                                                name: (data as any).name,
                                                content: (data as any).content,
                                                parentFolderId: (data as any).parentFolderId ?? existing.parentFolderId ?? null
                                        });
                                        if (updated) {
                                                listeners.emit({ type: "updated", storageKey, entityId: id, data: updated });
                                        }
                                        return updated as T | undefined;
                                }

                                if ((data as any).name) {
                                        const renamed = await renameItemRecordDb(db, id, (data as any).name);
                                        if (renamed) {
                                                listeners.emit({ type: "updated", storageKey, entityId: id, data: renamed });
                                        }
                                        return renamed as T | undefined;
                                }

                                return existing as unknown as T;
                        }

                        const entities = await getGenericEntities<T>(db, storageKey);
                        const index = entities.findIndex(entity => entity.id === id);
                        if (index === -1) return undefined;

                        const updatedEntity = {
                                ...entities[index],
                                ...data,
                                updatedAt: getNow()
                        } as T;

                        entities[index] = updatedEntity;
                        await saveGenericEntities(db, storageKey, entities);
                        listeners.emit({ type: "updated", storageKey, entityId: id, data: updatedEntity });
                        return updatedEntity;
                },

                async delete(storageKey: string, id: string): Promise<boolean> {
                        if (storageKey === NOTE_STORAGE_KEY) {
                                const success = await deleteItemRecordDb(db, id);
                                if (success) {
                                        listeners.emit({ type: "deleted", storageKey, entityId: id });
                                }
                                return success;
                        }

                        const entities = await getGenericEntities<BaseEntity>(db, storageKey);
                        const newEntities = entities.filter(entity => entity.id !== id);
                        if (newEntities.length === entities.length) return false;

                        await saveGenericEntities(db, storageKey, newEntities);
                        listeners.emit({ type: "deleted", storageKey, entityId: id });
                        return true;
                },

                async list<T extends BaseEntity>(storageKey: string): Promise<T[]> {
                        if (storageKey === NOTE_STORAGE_KEY) {
                                const result = await readNoteEntitiesDb(db);
                                return Array.isArray(result) ? (result as T[]) : result ? [result as T] : [];
                        }
                        return getGenericEntities<T>(db, storageKey);
                },

                async move<T extends BaseEntity>(storageKey: string, entityId: string, targetParentId: string | null) {
                        if (storageKey === NOTE_STORAGE_KEY) {
                                const success = await moveItemRecordDb(db, entityId, targetParentId);
                                if (success) {
                                        listeners.emit({
                                                type: "updated",
                                                storageKey,
                                                entityId,
                                                data: await getItemByIdDb(db, entityId)
                                        });
                                }
                                return success;
                        }

                        const entities = await getGenericEntities<T>(db, storageKey);
                        const updatedEntity = entities.find(entity => entity.id === entityId);
                        if (!updatedEntity) return false;

                        (updatedEntity as any).parentId = targetParentId ?? undefined;
                        updatedEntity.updatedAt = getNow();
                        await saveGenericEntities(db, storageKey, entities);
                        listeners.emit({ type: "updated", storageKey, entityId, data: updatedEntity });
                        return true;
                }
        };

        return adapter;
}
