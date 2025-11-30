// Import polyfills FIRST before database drivers
import "../../utils/process-polyfill";
import "../../utils/buffer-polyfill";

import * as schema from "./schema";

import type { NoteDatabase } from "./note-storage";

const isBrowser = typeof window !== "undefined";

// Postgres client type (postgres module exports a function, not a default)
type PostgresClient = Awaited<ReturnType<typeof import("postgres")>>;

let cachedDb: NoteDatabase | null = null;
let postgresClient: PostgresClient | null = null;

function getDatabaseUrl(): string {
        const viteUrl = import.meta.env.VITE_DATABASE_URL as string | undefined;
        if (viteUrl) return viteUrl;

        // In browser/client-side code, we only use import.meta.env
        // Server-side code should set VITE_DATABASE_URL or use a different initialization path
        throw new Error("VITE_DATABASE_URL environment variable is required. Set it in your .env file.");
}

export async function getDb() {
        if (!cachedDb) {
                const url = getDatabaseUrl();

                if (isBrowser) {
                        // Use Neon serverless driver for browser (works over HTTP/WebSocket)
                        const { neon } = await import("@neondatabase/serverless");
                        const { drizzle } = await import("drizzle-orm/neon-http");
                        const neonSql = neon(url);
                        
                        // Create a compatibility wrapper that supports both tagged templates and function calls
                        // drizzle-orm calls sql() as a function, but Neon requires tagged templates
                        // Neon provides sql.query() for function-style calls
                        const sql = new Proxy(neonSql, {
                                apply(target, thisArg, args) {
                                        // If called as a function (sql(query, params, options)), use sql.query
                                        if (args.length >= 1 && typeof args[0] === 'string') {
                                                const query = args[0];
                                                const params = args[1] || [];
                                                const options = args[2];
                                                
                                                // Use sql.query for function-style calls
                                                if (neonSql.query) {
                                                        return neonSql.query(query, params, options);
                                                }
                                                
                                                // Fallback error
                                                throw new Error(
                                                        "Neon sql.query() method not available. " +
                                                        "Please ensure @neondatabase/serverless is up to date."
                                                );
                                        }
                                        // If called as tagged template, use original function
                                        return target.apply(thisArg, args);
                                }
                        });
                        
                        cachedDb = drizzle(sql, { schema });
                } else {
                        // Use postgres-js for server-side (TCP connection)
                        const { drizzle } = await import("drizzle-orm/postgres-js");
                        const postgres = (await import("postgres")).default;
                        const client = postgres(url, {
                                max: 1,
                                idle_timeout: 20,
                                connect_timeout: 10,
                        });
                        postgresClient = client;
                        cachedDb = drizzle(client, { schema });
                }
        }
        return cachedDb;
}

export function resetDrizzleClient(): void {
        // Clean up postgres client if it exists (server-side only)
        if (postgresClient) {
                postgresClient.end();
                postgresClient = null;
        }
        // Note: Neon serverless client doesn't need explicit cleanup
        cachedDb = null;
}
