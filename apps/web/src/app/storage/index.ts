import { initializeDefaultNotesAndFolders } from '@/features/notes/utils/initialize-defaults'

import { initializeGenericStorage } from '@skriuw/storage/generic-storage-factory'

import { DEFAULT_STORAGE_CONFIG } from './config'

let initializationPromise: Promise<void> | null = null

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
                const storage = await initializeGenericStorage(DEFAULT_STORAGE_CONFIG)
                await storage.getStorageInfo()

                // Initialize default notes and folders for new visitors
                await initializeDefaultNotesAndFolders()
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
