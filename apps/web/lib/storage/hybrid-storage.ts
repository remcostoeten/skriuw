/**
 * @fileoverview Hybrid Storage Adapter
 * @description Automatically switches between localStorage (demo mode) and API (authenticated).
 * Handles migration when user authenticates.
 */

import { setAdapter } from '@skriuw/crud'
import { clearDemoData, createLocalStorageAdapter, getDemoData, hasDemoData } from './adapters/local-storage'
import { createClientApiAdapter } from './adapters/client-api'

let currentMode: 'demo' | 'authenticated' = 'demo'

/**
 * Initialize storage in demo mode (localStorage)
 */
export function initializeDemoStorage(): void {
    setAdapter(createLocalStorageAdapter())
    currentMode = 'demo'
}

/**
 * Switch to authenticated mode (API)
 * Call this after successful authentication
 */
export function initializeAuthenticatedStorage(): void {
    setAdapter(createClientApiAdapter())
    currentMode = 'authenticated'
}

/**
 * Get current storage mode
 */
export function getStorageMode(): 'demo' | 'authenticated' {
    return currentMode
}

/**
 * Check if user has demo data that should be migrated
 */
export function shouldMigrateDemoData(): boolean {
    return hasDemoData()
}

/**
 * Migrate demo data to the database after authentication
 * @returns Number of items migrated
 */
export async function migrateDemoDataToDb(): Promise<number> {
    if (!hasDemoData()) return 0

    const demoData = getDemoData()
    let migratedCount = 0

    // Switch to API adapter for migration
    const apiAdapter = createClientApiAdapter()

    for (const [storageKey, items] of Object.entries(demoData)) {
        for (const item of items as Array<{ id: string;[key: string]: unknown }>) {
            try {
                // Remove the local_ prefix from IDs and create fresh in DB
                const { id, createdAt, updatedAt, ...data } = item
                await apiAdapter.create(storageKey, data as any)
                migratedCount++
            } catch {
                // Silently skip failed items (might already exist, etc.)
            }
        }
    }

    // Clear demo data after successful migration
    clearDemoData()

    return migratedCount
}

/**
 * Initialize storage based on authentication status
 */
export function initializeStorage(isAuthenticated: boolean): void {
    if (isAuthenticated) {
        initializeAuthenticatedStorage()
    } else {
        initializeDemoStorage()
    }
}
