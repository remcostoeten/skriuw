import type { GenericStorageAdapter, StorageConfig } from "./generic-types";
import { createGenericLocalStorageAdapter } from "./adapters/generic-local-storage";

type AdapterFactory = (config?: StorageConfig['options']) => GenericStorageAdapter;

const adapters = new Map<StorageConfig['adapter'], AdapterFactory>();

adapters.set('localStorage', () => createGenericLocalStorageAdapter());

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
		// Auto-initialize with localStorage if not initialized
		currentGenericStorage = createGenericStorageAdapter({ adapter: 'localStorage' });
		currentGenericStorage.initialize().catch(err => {
			console.error('Failed to auto-initialize generic storage:', err);
		});
	}
	return currentGenericStorage;
}

export async function destroyGenericStorage(): Promise<void> {
	if (currentGenericStorage) {
		await currentGenericStorage.destroy();
		currentGenericStorage = null;
	}
}

