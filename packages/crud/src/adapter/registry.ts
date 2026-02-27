import type {
	StorageAdapter,
	StorageAdapterCapabilities,
	StorageBackend
} from '../types/adapter'

let currentAdapter: StorageAdapter | null = null

/**
 * Registers a storage adapter for all CRUD operations.
 * Must be called before any CRUD operation.
 *
 * @param adapter - The storage adapter implementation
 *
 * @example
 * ```typescript
 * import { setAdapter } from '@skriuw/crud/adapter'
 * import { createApiAdapter } from './adapters/api'
 *
 * setAdapter(createApiAdapter('/api'))
 * ```
 */
export function setAdapter(adapter: StorageAdapter): void {
	currentAdapter = adapter
}

/**
 * Gets the current storage adapter.
 * @throws Error if no adapter is registered
 * @returns The registered storage adapter
 */
export function getAdapter(): StorageAdapter {
	if (!currentAdapter) {
		throw new Error(
			'Storage adapter not configured. Call setAdapter() before using CRUD operations.'
		)
	}
	return currentAdapter
}

/**
 * Checks if an adapter is currently registered.
 */
export function hasAdapter(): boolean {
	return currentAdapter !== null
}

/**
 * Gets capabilities metadata for the currently registered adapter.
 * Returns null when no adapter is configured or capabilities are not provided.
 */
export function getAdapterCapabilities(): StorageAdapterCapabilities | null {
	if (!currentAdapter?.capabilities) return null
	return currentAdapter.capabilities
}

/**
 * Checks whether the active adapter supports a given backend.
 */
export function adapterSupportsBackend(backend: StorageBackend): boolean {
	const capabilities = getAdapterCapabilities()
	if (!capabilities) return false
	return capabilities.backends.includes(backend)
}

/**
 * Returns true when the active adapter can operate in local-only privacy mode.
 */
export function isPrivacyModeSafeAdapter(): boolean {
	const capabilities = getAdapterCapabilities()
	if (!capabilities) return false
	return capabilities.syncMode === 'local-only'
}

/**
 * Resets the adapter to null.
 * Primarily for testing - allows test isolation.
 *
 * @internal
 */
export function resetAdapter(): void {
	currentAdapter = null
}
