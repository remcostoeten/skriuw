/**
 * @fileoverview @skriuw/crud - Enterprise CRUD Layer
 * @description High-performance CRUD operations with caching, batching,
 * optimistic updates, validation, and comprehensive error handling.
 *
 * @example
 * ```typescript
 * import { create, readOne, update, destroy, initializeStorage } from '@skriuw/crud'
 *
 * // Initialize with your storage adapter
 * initializeStorage(myAdapter)
 *
 * // Create
 * const result = await create<Note>('notes', { name: 'My Note' })
 *
 * // Read
 * const note = await readOne<Note>('notes', 'note-123')
 *
 * // Update
 * await update<Note>('notes', 'note-123', { name: 'Updated' })
 *
 * // Delete
 * await destroy('notes', 'note-123')
 * ```
 *
 * @module @skriuw/crud
 */

// ============================================================================
// TYPES
// ============================================================================

export * from './types'

// ============================================================================
// ERRORS
// ============================================================================

export * from './errors'

// ============================================================================
// CACHE
// ============================================================================

export * from './cache'

// ============================================================================
// OPERATIONS
// ============================================================================

export {
    create,
    batchCreate,
    readOne,
    readMany,
    batchRead,
    update,
    batchUpdate,
    destroy,
    batchDestroy,
} from './operations'

// ============================================================================
// STORAGE INITIALIZATION
// ============================================================================

import {
    setCreateAdapter,
    setReadAdapter,
    setUpdateAdapter,
    setDestroyAdapter,
} from './operations'

import type { BaseEntity } from './types'

/**
 * Storage adapter interface that must be implemented.
 */
export interface StorageAdapter {
    create<T extends BaseEntity>(
        storageKey: string,
        data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<T>

    read<T extends BaseEntity>(
        storageKey: string,
        options?: { getById?: string; getAll?: boolean }
    ): Promise<T[] | T | undefined>

    update<T extends BaseEntity>(
        storageKey: string,
        id: string,
        data: Partial<T>
    ): Promise<T | undefined>

    delete(storageKey: string, id: string): Promise<boolean>
}

/**
 * Initializes all CRUD operations with a storage adapter.
 *
 * @param adapter - Storage adapter implementation
 *
 * @example
 * ```typescript
 * import { initializeStorage } from '@skriuw/crud'
 * import { createServerlessApiAdapter } from './adapters'
 *
 * initializeStorage(createServerlessApiAdapter('/api'))
 * ```
 */
export function initializeStorage(adapter: StorageAdapter): void {
    setCreateAdapter(adapter)
    setReadAdapter(adapter)
    setUpdateAdapter(adapter)
    setDestroyAdapter(adapter)
}
