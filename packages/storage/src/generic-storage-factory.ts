import { createGenericLocalStorageAdapter } from "./adapters/generic-local-storage";
import { createServerlessApiAdapter } from "./adapters/serverless-api";

import type {
        GenericStorageAdapter,
        StorageConfig,
        StorageAdapterOptions
} from "./generic-types";

type AdapterFactory = (config?: StorageConfig['options']) => GenericStorageAdapter | Promise<GenericStorageAdapter>;

const adapters = new Map<StorageConfig['adapter'], AdapterFactory>();

adapters.set("localStorage", () => createGenericLocalStorageAdapter());

// Serverless API adapter for database operations via Vercel functions
adapters.set("serverless-api", (config) => createServerlessApiAdapter(config?.apiBaseUrl as string | undefined));

// Dynamic adapter loading for database to avoid build issues
adapters.set("database", async (config) => {
	const { createGenericDatabaseAdapter } = await import("./adapters/generic-database");
	return createGenericDatabaseAdapter(config);
});

export async function createGenericStorageAdapter(config: StorageConfig): Promise<GenericStorageAdapter> {
	const factory = adapters.get(config.adapter);

	if (!factory) {
		throw new Error(`Storage adapter '${config.adapter}' not found. Available: ${Array.from(adapters.keys()).join(', ')}`);
	}

	return await factory(config.options);
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
