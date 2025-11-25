import { initializeDefaultNotesAndFolders } from '@/features/notes/utils/initialize-defaults'

import { initializeGenericStorage } from '@/api/storage/generic-storage-factory'
import type { StorageConfig } from '@/api/storage/generic-types'

import { DEFAULT_STORAGE_CONFIG, getStorageConfig } from './config'

let initializationPromise: Promise<void> | null = null
let currentConfig: StorageConfig | null = null

/**
 * Initialize the storage system with the generic adapter
 */
export async function initializeAppStorage(config?: StorageConfig): Promise<void> {
        const resolvedConfig = config ?? getStorageConfig() ?? DEFAULT_STORAGE_CONFIG

        if (initializationPromise && currentConfig?.adapter === resolvedConfig.adapter) {
                return initializationPromise
        }

        currentConfig = resolvedConfig
        initializationPromise = performInitialization(resolvedConfig)
        return initializationPromise
}

async function performInitialization(config: StorageConfig): Promise<void> {
        try {
                console.info(`Initializing storage with adapter: ${config.adapter}`)

                const storage = await initializeGenericStorage(config)
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
        currentConfig = null
        return initializeAppStorage()
}
