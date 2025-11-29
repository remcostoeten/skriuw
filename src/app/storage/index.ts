import { initializeDefaultNotesAndFolders } from '@/features/notes/utils/initialize-defaults'

import { initializeGenericStorage } from '@/api/storage/generic-storage-factory'
import { DEFAULT_STORAGE_CONFIG } from './config'

let initializationPromise: Promise<void> | null = null

/**
 * Initialize the storage system with localStorage
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
                console.info('Initializing storage with localStorage')

                const storage = await initializeGenericStorage(DEFAULT_STORAGE_CONFIG)
                const info = await storage.getStorageInfo()

                console.info('Storage initialized successfully:', {
                        adapter: info.adapter,
                        type: info.type,
                        totalItems: info.totalItems,
                        capabilities: info.capabilities
                })

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
