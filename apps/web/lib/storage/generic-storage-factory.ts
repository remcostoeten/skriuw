import { createServerlessApiAdapter } from './adapters/serverless-api'

import type { GenericStorageAdapter, StorageConfig } from './generic-types'

/**
 * Factory function for creating storage adapters
 */
type AdapterFactory = (
	config?: StorageConfig['options']
) => GenericStorageAdapter | Promise<GenericStorageAdapter>

const adapters = new Map<StorageConfig['adapter'], AdapterFactory>()

adapters.set('serverless-api', (config) =>
	createServerlessApiAdapter(config?.apiBaseUrl as string | undefined)
)

/**
 * Creates a storage adapter based on the configuration
 */
export async function createGenericStorageAdapter(
	config: StorageConfig
): Promise<GenericStorageAdapter> {
	const factory = adapters.get(config.adapter)

	if (!factory) {
		throw new Error(
			`Storage adapter '${config.adapter}' not found. Available: ${Array.from(adapters.keys()).join(', ')}`
		)
	}

	return await factory(config.options)
}

/**
 * Registers a storage adapter factory
 */
export function registerGenericStorageAdapter(
	name: StorageConfig['adapter'],
	factory: AdapterFactory
): void {
	adapters.set(name, factory)
}

/**
 * Gets the list of available storage adapters
 */
export function getAvailableGenericAdapters(): StorageConfig['adapter'][] {
	return Array.from(adapters.keys())
}

let currentGenericStorage: GenericStorageAdapter | null = null

/**
 * Initializes the storage adapter
 */
export async function initializeGenericStorage(
	config: StorageConfig
): Promise<GenericStorageAdapter> {
	if (currentGenericStorage) {
		await currentGenericStorage.destroy()
	}

	currentGenericStorage = await createGenericStorageAdapter(config)
	await currentGenericStorage.initialize()

	return currentGenericStorage
}

/**
 * Gets the current storage adapter
 */
export function getGenericStorage(): GenericStorageAdapter {
	if (!currentGenericStorage) {
		throw new Error('Generic storage not initialized. Call initializeGenericStorage first.')
	}
	return currentGenericStorage
}


/**
 * Destroys the storage adapter
 */
export async function destroyGenericStorage(): Promise<void> {
	if (currentGenericStorage) {
		await currentGenericStorage.destroy()
		currentGenericStorage = null
	}
}
