/**
 * @fileoverview Storage Client Initialization
 * @description Initializes @skriuw/crud with the client API adapter
 */

import { setAdapter, hasAdapter } from '@skriuw/crud'
import { createClientApiAdapter } from './adapters/client-api'

let initialized = false

/**
 * Ensures the storage adapter is initialized.
 * Safe to call multiple times - will only initialize once.
 */
export function ensureStorageInitialized(): void {
    if (initialized || hasAdapter()) return

    setAdapter(createClientApiAdapter())
    initialized = true
}

/**
 * Re-exports all CRUD operations from @skriuw/crud
 * Usage:
 * ```typescript
 * import { create, readOne, update, destroy } from '@/lib/storage/client'
 * ```
 */
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
} from '@skriuw/crud'

// Also export types
export type {
    BaseEntity,
    CrudResult,
    BatchCrudResult,
    CreateOptions,
    ReadOptions,
    UpdateOptions,
    DeleteOptions,
} from '@skriuw/crud'


export * as cache from '@skriuw/crud/cache'

// Auto-initialize on module load
ensureStorageInitialized()
