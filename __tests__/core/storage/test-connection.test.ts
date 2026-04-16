import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    PERSISTED_STORE_NAMES,
    type FolderId,
    type IsoTime,
    type PersistedFolder,
} from "@/core/shared/persistence-types";
import { closePersistenceDb, openPersistenceDb } from "@/core/storage/db";
import { getRecord } from "@/core/storage/get-record";
import { putRecord } from "@/core/storage/put-record";
import { PERSISTENCE_DB_NAME } from "@/core/storage/schema";

async function deletePersistenceDb(): Promise<void> {
    if (typeof indexedDB === "undefined") {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(PERSISTENCE_DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Failed to delete blocked IndexedDB database."));
    });
}

describe("storage indexeddb connection", () => {
    beforeEach(async () => {
        await closePersistenceDb();
        await deletePersistenceDb();
    });

    afterEach(async () => {
        await closePersistenceDb();
        await deletePersistenceDb();
    });

    test("opens the database", async () => {
        const db = await openPersistenceDb();

        expect(db).toBeDefined();
        expect(db.name).toBe(PERSISTENCE_DB_NAME);
    });

    test("saves and reads a folder record", async () => {
        const now = new Date().toISOString() as IsoTime;
        const folderId = "folder-test-1" as FolderId;

        const record: PersistedFolder = {
            id: folderId,
            name: "Inbox",
            parentId: null,
            createdAt: now,
            updatedAt: now,
        };

        const saved = await putRecord(PERSISTED_STORE_NAMES.folders, record);
        const loaded = await getRecord(PERSISTED_STORE_NAMES.folders, folderId);

        expect(saved).toEqual(record);
        expect(loaded).toEqual(record);
    });
});
