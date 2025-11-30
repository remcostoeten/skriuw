/**
 * Simple storage functions for key-value pairs using Postgres (server) or localStorage (browser)
 * Replaces the old generic CRUD layer for simple storage needs
 */
import { getDb } from "@/data/drizzle/client";
import { genericStorage } from "@/data/drizzle/base-entities";
import { eq } from "drizzle-orm";

const isBrowser = typeof window !== "undefined";

// localStorage fallback for browser
function getLocalStorageValue<T = any>(key: string): T | null {
        try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
        } catch (error) {
                console.error(`Failed to get localStorage value for key ${key}:`, error);
                return null;
        }
}

function setLocalStorageValue<T = any>(key: string, value: T): void {
        try {
                localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
                console.error(`Failed to set localStorage value for key ${key}:`, error);
                throw new Error(`Failed to set storage value: ${error instanceof Error ? error.message : String(error)}`);
        }
}

function deleteLocalStorageValue(key: string): boolean {
        try {
                localStorage.removeItem(key);
                return true;
        } catch (error) {
                console.error(`Failed to delete localStorage value for key ${key}:`, error);
                return false;
        }
}

function getAllLocalStorageKeys(): string[] {
        try {
                const keys: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key) keys.push(key);
                }
                return keys;
        } catch (error) {
                console.error("Failed to get all localStorage keys:", error);
                return [];
        }
}

export async function getStorageValue<T = any>(key: string): Promise<T | null> {
        // Use localStorage fallback in browser when Postgres is not available
        if (isBrowser) {
                try {
                        // Try Postgres first if available
                        const db = await getDb();
                        const result = await db.query.genericStorage.findFirst({
                                where: eq(genericStorage.key, key)
                        });
                        return result ? (result.value as T) : null;
                } catch (error) {
                        // Fall back to localStorage if Postgres fails (e.g., in browser)
                        return getLocalStorageValue<T>(key);
                }
        }

        // Server-side: use Postgres only
        try {
                const db = await getDb();
                const result = await db.query.genericStorage.findFirst({
                        where: eq(genericStorage.key, key)
                });
                return result ? (result.value as T) : null;
        } catch (error) {
                console.error(`Failed to get storage value for key ${key}:`, error);
                return null;
        }
}

export async function setStorageValue<T = any>(key: string, value: T): Promise<void> {
        // Use localStorage fallback in browser when Postgres is not available
        if (isBrowser) {
                try {
                        // Try Postgres first if available
                        const db = await getDb();
                        const existing = await db.query.genericStorage.findFirst({
                                where: eq(genericStorage.key, key)
                        });

                        if (existing) {
                                await db
                                        .update(genericStorage)
                                        .set({
                                                value: value as any,
                                                updatedAt: new Date()
                                        })
                                        .where(eq(genericStorage.key, key));
                        } else {
                                await db.insert(genericStorage).values({
                                        key,
                                        value: value as any,
                                        updatedAt: new Date()
                                });
                        }
                        return;
                } catch (error) {
                        // Fall back to localStorage if Postgres fails (e.g., in browser)
                        setLocalStorageValue(key, value);
                        return;
                }
        }

        // Server-side: use Postgres only
        try {
                const db = await getDb();
                const existing = await db.query.genericStorage.findFirst({
                        where: eq(genericStorage.key, key)
                });

                if (existing) {
                        await db
                                .update(genericStorage)
                                .set({
                                        value: value as any,
                                        updatedAt: new Date()
                                })
                                .where(eq(genericStorage.key, key));
                } else {
                        await db.insert(genericStorage).values({
                                key,
                                value: value as any,
                                updatedAt: new Date()
                        });
                }
        } catch (error) {
                throw new Error(`Failed to set storage value for key ${key}: ${error instanceof Error ? error.message : String(error)}`);
        }
}

export async function deleteStorageValue(key: string): Promise<boolean> {
        // Use localStorage fallback in browser when Postgres is not available
        if (isBrowser) {
                try {
                        // Try Postgres first if available
                        const db = await getDb();
                        const result = await db.delete(genericStorage).where(eq(genericStorage.key, key));
                        return (result as any).rowCount > 0;
                } catch (error) {
                        // Fall back to localStorage if Postgres fails (e.g., in browser)
                        return deleteLocalStorageValue(key);
                }
        }

        // Server-side: use Postgres only
        try {
                const db = await getDb();
                const result = await db.delete(genericStorage).where(eq(genericStorage.key, key));
                return (result as any).rowCount > 0;
        } catch (error) {
                throw new Error(`Failed to delete storage value for key ${key}: ${error instanceof Error ? error.message : String(error)}`);
        }
}

export async function getAllStorageKeys(): Promise<string[]> {
        // Use localStorage fallback in browser when Postgres is not available
        if (isBrowser) {
                try {
                        // Try Postgres first if available
                        const db = await getDb();
                        const results = await db.select({ key: genericStorage.key }).from(genericStorage);
                        return results.map(r => r.key);
                } catch (error) {
                        // Fall back to localStorage if Postgres fails (e.g., in browser)
                        return getAllLocalStorageKeys();
                }
        }

        // Server-side: use Postgres only
        try {
                const db = await getDb();
                const results = await db.select({ key: genericStorage.key }).from(genericStorage);
                return results.map(r => r.key);
        } catch (error) {
                console.error("Failed to get all storage keys:", error);
                return [];
        }
}

