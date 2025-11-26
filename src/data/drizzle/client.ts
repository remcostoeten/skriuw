import { createClient, type Client } from "@libsql/client/web";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import * as schema from "./base-entities";

let cachedClient: Client | null = null;
let cachedDb: LibSQLDatabase<typeof schema> | null = null;

function getDatabaseUrl(): string {
        const viteUrl = (import.meta as any)?.env?.VITE_LIBSQL_URL as string | undefined;
        if (viteUrl) return viteUrl;

        if (typeof process !== "undefined" && process.env?.VITE_LIBSQL_URL) {
                return process.env.VITE_LIBSQL_URL;
        }

        // In production (e.g., Vercel), require explicit LibSQL URL
        // File-based SQLite doesn't work in serverless environments
        if (import.meta.env.PROD) {
                throw new Error(
                        "VITE_LIBSQL_URL is required in production. " +
                        "File-based SQLite is not supported in serverless environments. " +
                        "Please configure a LibSQL (Turso) database URL."
                );
        }

        // Only allow file: fallback in development
        return "file:local.db";
}

function getAuthToken(): string | undefined {
        const viteToken = (import.meta as any)?.env?.VITE_LIBSQL_AUTH_TOKEN as string | undefined;
        if (viteToken) return viteToken;

        if (typeof process !== "undefined") {
                return process.env?.VITE_LIBSQL_AUTH_TOKEN;
        }

        return undefined;
}

export function getLibsqlClient(): Client {
        if (!cachedClient) {
                cachedClient = createClient({
                        url: getDatabaseUrl(),
                        authToken: getAuthToken()
                });
        }
        return cachedClient;
}

export function getDb(): LibSQLDatabase<typeof schema> {
        if (!cachedDb) {
                        cachedDb = drizzle(getLibsqlClient(), { schema });
        }
        return cachedDb;
}

export function resetDrizzleClient(): void {
        cachedClient = null;
        cachedDb = null;
}
