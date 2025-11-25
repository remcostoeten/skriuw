import { createGenericDrizzleLibsqlHttpAdapter } from "./adapters/generic-drizzle-libsql-http";
import { createGenericDrizzleTauriSqliteAdapter } from "./adapters/generic-drizzle-tauri-sqlite";
import { createGenericLocalStorageAdapter } from "./adapters/generic-local-storage";

import type {
        GenericStorageAdapter,
        LibsqlHttpOptions,
        StorageConfig,
        StorageAdapterOptions,
        TauriSqliteOptions
} from "./generic-types";

type AdapterFactory = (config?: StorageConfig['options']) => GenericStorageAdapter;

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
adapters.set("drizzleTauriSqlite", options => {
        const resolved = resolveTauriOptions(options);
        return createGenericDrizzleTauriSqliteAdapter(resolved);
});

export function createGenericStorageAdapter(config: StorageConfig): GenericStorageAdapter {
	const factory = adapters.get(config.adapter);
	
	if (!factory) {
		throw new Error(`Storage adapter '${config.adapter}' not found. Available: ${Array.from(adapters.keys()).join(', ')}`);
	}

	return factory(config.options);
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

	currentGenericStorage = createGenericStorageAdapter(config);
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
