import { setAdapter, hasAdapter } from '@skriuw/crud'
import { createClientApiAdapter } from '../../lib/storage/adapters/client-api'
import { initializeDefaultNotesAndFolders } from '../../features/notes/utils/initialize-defaults'

let initializationPromise: Promise<void> | null = null

/**
 * Ensures the @skriuw/crud adapter is initialized.
 * Safe to call multiple times - will only initialize once.
 */
function ensureStorageInitialized(): void {
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
		// Initialize default notes and folders for new visitors (non-blocking)
		// Don't await this - let it run in background
		initializeDefaultNotesAndFolders().catch(error => {
			console.error('Failed to initialize defaults in background:', error)
		})
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
