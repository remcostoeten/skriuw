import type { StorageAdapter } from "../types/adapter";

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
 * Resets the adapter to null.
 * Primarily for testing - allows test isolation.
 *
 * @internal
 */
export function resetAdapter(): void {
	currentAdapter = null
}
