import { createGenericDrizzleLibsqlHttpAdapter } from "./adapters/generic-drizzle-libsql-http";
import { createGenericLocalStorageAdapter } from "./adapters/generic-local-storage";

// Dynamic import for Tauri adapter to avoid bundling it in web builds
async function loadTauriAdapter() {
        try {
                const { createGenericDrizzleTauriSqliteAdapter } = await import("./adapters/generic-drizzle-tauri-sqlite");
                return createGenericDrizzleTauriSqliteAdapter;
        } catch (error) {
                // Tauri adapter not available (e.g., in web builds)
                throw new Error("Tauri adapter is not available in this environment. Use 'drizzleLibsqlHttp' or 'localStorage' instead.");
        }
}

import type {
        GenericStorageAdapter,
        LibsqlHttpOptions,
        StorageConfig,
        StorageAdapterOptions,
        TauriSqliteOptions
} from "./generic-types";

type AdapterFactory = (config?: StorageConfig['options']) => GenericStorageAdapter | Promise<GenericStorageAdapter>;

const adapters = new Map<StorageConfig['adapter'], AdapterFactory>();

function hasLibsqlOptions(options?: StorageAdapterOptions): options is LibsqlHttpOptions {
        return Boolean(options && typeof options === "object" && "url" in options && typeof (options as any).url === "string");
}

function hasTauriOptions(options?: StorageAdapterOptions): options is TauriSqliteOptions {
        return Boolean(options && typeof options === "object" && "databasePath" in options);
}

function resolveLibsqlOptions(options?: StorageAdapterOptions): LibsqlHttpOptions {
        if (hasLibsqlOptions(options)) {
                return options;
        }

        const url =
                (import.meta as any)?.env?.VITE_LIBSQL_URL ??
                (typeof process !== "undefined" ? process.env?.VITE_LIBSQL_URL : undefined) ??
                (typeof process !== "undefined" ? process.env?.LIBSQL_DATABASE_URL : undefined);

        if (!url) {
                throw new Error("Missing libsql connection details. Provide VITE_LIBSQL_URL or adapter options.");
        }

        const authToken =
                (import.meta as any)?.env?.VITE_LIBSQL_AUTH_TOKEN ??
                (typeof process !== "undefined" ? process.env?.VITE_LIBSQL_AUTH_TOKEN : undefined) ??
                (typeof process !== "undefined" ? process.env?.LIBSQL_AUTH_TOKEN : undefined);

        return { url, authToken };
}

function resolveTauriOptions(options?: StorageAdapterOptions): TauriSqliteOptions {
        if (hasTauriOptions(options)) {
                                return options;
        }

        const databasePath =
                (import.meta as any)?.env?.VITE_SQLITE_PATH ??
                (typeof process !== "undefined" ? process.env?.VITE_SQLITE_PATH : undefined) ??
                (typeof process !== "undefined" ? process.env?.SQLITE_DATABASE_PATH : undefined) ??
                "skriuw.db";

        return { databasePath };
}

adapters.set("localStorage", () => createGenericLocalStorageAdapter());
adapters.set("drizzleLibsqlHttp", options => {
        const resolved = resolveLibsqlOptions(options);
        return createGenericDrizzleLibsqlHttpAdapter(resolved);
});
adapters.set("drizzleTauriSqlite", async options => {
        const resolved = resolveTauriOptions(options);
        const createAdapter = await loadTauriAdapter();
        return createAdapter(resolved);
});

export async function createGenericStorageAdapter(config: StorageConfig): Promise<GenericStorageAdapter> {
	const factory = adapters.get(config.adapter);
	
	if (!factory) {
		throw new Error(`Storage adapter '${config.adapter}' not found. Available: ${Array.from(adapters.keys()).join(', ')}`);
	}

	const result = factory(config.options);
	// Handle both sync and async factories (Tauri adapter is async)
	return result instanceof Promise ? result : Promise.resolve(result);
}

export function registerGenericStorageAdapter(
	name: StorageConfig['adapter'],
	factory: AdapterFactory
): void {
	adapters.set(name, factory);
}

export function getAvailableGenericAdapters(): StorageConfig['adapter'][] {
	return Array.from(adapters.keys());
}

let currentGenericStorage: GenericStorageAdapter | null = null;

export async function initializeGenericStorage(config: StorageConfig): Promise<GenericStorageAdapter> {
	if (currentGenericStorage) {
		await currentGenericStorage.destroy();
	}

	currentGenericStorage = await createGenericStorageAdapter(config);
	await currentGenericStorage.initialize();

	return currentGenericStorage;
}

export function getGenericStorage(): GenericStorageAdapter {
        if (!currentGenericStorage) {
                throw new Error('Generic storage not initialized. Call initializeGenericStorage first.');
        }
        return currentGenericStorage;
}

export async function destroyGenericStorage(): Promise<void> {
	if (currentGenericStorage) {
		await currentGenericStorage.destroy();
		currentGenericStorage = null;
	}
}
