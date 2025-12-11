import { initializeDefaultNotesAndFolders } from '../../features/notes/utils/initialize-defaults'

let initializationPromise: Promise<void> | null = null

/**
 * Initialize the storage system.
 * Note: The adapter is set by AuthInitializer based on auth status.
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
		// Initialize default notes and folders for new visitors (non-blocking)
		// Don't await this - let it run in background
		initializeDefaultNotesAndFolders().catch(() => {
			// Silently fail - will work once storage is ready
		})
	} catch {
		initializationPromise = null
	}
}

/**
 * @description Reset storage completely (for development/testing)
 */
export async function _resetStorage(): Promise<void> {
	initializationPromise = null
	return initializeAppStorage()
}
