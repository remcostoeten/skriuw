import { setAdapter, hasAdapter } from '@skriuw/crud'
import { createClientApiAdapter } from '../../lib/storage/adapters/client-api'

let initializationPromise: Promise<void> | null = null

/**
 * Ensures the @skriuw/crud adapter is initialized.
 * Safe to call multiple times - will only initialize once.
 */
export function ensureStorageInitialized(): void {
	if (hasAdapter()) return
	setAdapter(createClientApiAdapter())
}

/**
 * Initialize the storage system with database (PostgreSQL via Drizzle)
 */
export async function initializeAppStorage(): Promise<void> {
	if (initializationPromise) {
		return initializationPromise
	}

	initializationPromise = performInitialization()
	return initializationPromise
}

async function performInitialization(): Promise<void> {
	try {
		ensureStorageInitialized()
	} catch (error) {
		initializationPromise = null
		console.error('Failed to initialize storage:', error)
		throw error
	}
}

/**
 * @description Reset storage completely (for development/testing)
 */
export async function _resetStorage(): Promise<void> {
	initializationPromise = null
	return initializeAppStorage()
}
