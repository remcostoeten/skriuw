import { initializeDefaultNotesAndFolders } from '@/features/notes/utils/initialize-defaults'
import { getDb } from '@/data/drizzle/client'

let initializationPromise: Promise<void> | null = null

/**
 * Initialize the storage system (Postgres connection)
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
                console.info('Initializing database connection (using Neon in browser, postgres-js on server)')

                // Test connection by getting the db instance
                // In browser, this uses Neon serverless (HTTP/WebSocket)
                // On server, this uses postgres-js (TCP)
                const db = await getDb()
                console.info('Database connection initialized successfully')

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
