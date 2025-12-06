/**
 * @fileoverview Enterprise CRUD Layer - Type Definitions
 * @description Comprehensive type system for CRUD operations with support for
 * caching, batching, optimistic updates, and error handling.
 * @module lib/storage/crud/types
 */


/**
 * Base entity type that all storable entities must extend.
 * Provides common fields for identification and auditing.
 */
export interface BaseEntity {
    /** Unique identifier for the entity */
    id: string
    /** Unix timestamp (ms) when the entity was created */
    createdAt: number
    /** Unix timestamp (ms) when the entity was last updated */
    updatedAt: number
}

/**
 * Result wrapper for all CRUD operations providing consistent response structure.
 * @template T - The entity type being operated on
 */
export interface CrudResult<T> {
    /** Whether the operation succeeded */
    success: boolean
    /** The resulting data (single entity, array, or undefined) */
    data: T | null
    /** Error information if operation failed */
    error?: CrudError
    /** Operation metadata */
    meta: CrudMeta
}

/**
 * Result wrapper for batch operations.
 * @template T - The entity type being operated on
 */
export interface BatchCrudResult<T> {
    /** Whether all operations in the batch succeeded */
    success: boolean
    /** Array of individual results for each operation */
    results: CrudResult<T>[]
    /** Summary of batch operation */
    summary: BatchSummary
    /** Overall metadata */
    meta: CrudMeta
}

/**
 * Summary statistics for batch operations.
 */
export interface BatchSummary {
    /** Total number of operations in the batch */
    total: number
    /** Number of successful operations */
    succeeded: number
    /** Number of failed operations */
    failed: number
    /** Number of skipped operations (e.g., duplicates) */
    skipped: number
}

/**
 * Error structure for CRUD operations.
 */
export interface CrudError {
    /** Machine-readable error code */
    code: CrudErrorCode
    /** Human-readable error message */
    message: string
    /** Additional error details */
    details?: Record<string, unknown>
    /** Stack trace (only in development) */
    stack?: string
}

/**
 * Error codes for CRUD operations.
 */
export type CrudErrorCode =
    | 'NOT_FOUND'
    | 'ALREADY_EXISTS'
    | 'VALIDATION_ERROR'
    | 'CONSTRAINT_VIOLATION'
    | 'PERMISSION_DENIED'
    | 'NETWORK_ERROR'
    | 'TIMEOUT'
    | 'STORAGE_FULL'
    | 'INTERNAL_ERROR'
    | 'BATCH_PARTIAL_FAILURE'

/**
 * Metadata for CRUD operation results.
 */
export interface CrudMeta {
    /** Unix timestamp when operation started */
    timestamp: number
    /** Duration of operation in milliseconds */
    duration: number
    /** Whether result was served from cache */
    fromCache: boolean
    /** Whether this was an optimistic update */
    optimistic: boolean
    /** Request ID for tracing */
    requestId: string
    /** Cache key if applicable */
    cacheKey?: string
}


/**
 * Options for create operations.
 * @template T - The entity type being created
 */
export interface CreateOptions<T extends BaseEntity = BaseEntity> {
    /**
     * Skip duplicate check and allow potential constraint errors.
     * @default false
     */
    skipDuplicateCheck?: boolean
    /**
     * Custom ID to use instead of auto-generating.
     */
    customId?: string
    /**
     * Enable optimistic update (returns immediately, syncs in background).
     * @default false
     */
    optimistic?: boolean
    /**
     * Callback invoked when optimistic update is confirmed or rejected.
     */
    onOptimisticSettled?: (result: CrudResult<T>) => void
    /**
     * Validation function to run before creating.
     */
    validate?: (data: CreateInput<T>) => ValidationResult
    /**
     * Transform data before storage.
     */
    transform?: (data: CreateInput<T>) => CreateInput<T>
}

/**
 * Batch create options.
 * @template T - The entity type being created
 */
export interface BatchCreateOptions<T extends BaseEntity = BaseEntity>
    extends Omit<CreateOptions<T>, 'customId' | 'onOptimisticSettled'> {
    /**
     * Continue processing remaining items if one fails.
     * @default true
     */
    continueOnError?: boolean
    /**
     * Maximum number of concurrent create operations.
     * @default 10
     */
    concurrency?: number
    /**
     * Callback for batch progress updates.
     */
    onProgress?: (progress: BatchProgress) => void
}

/**
 * Input type for creating entities (excludes auto-generated fields).
 * @template T - The full entity type
 */
export type CreateInput<T extends BaseEntity> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string
}

/**
 * Options for read operations.
 * @template T - The entity type being read
 */
export interface ReadOptions<T extends BaseEntity = BaseEntity> {
    /**
     * Fetch a single entity by ID.
     */
    id?: string
    /**
     * Filter function for querying multiple entities.
     */
    filter?: (item: T) => boolean
    /**
     * Sort function for ordering results.
     */
    sort?: (a: T, b: T) => number
    /**
     * Maximum number of results to return.
     */
    limit?: number
    /**
     * Number of results to skip (for pagination).
     */
    offset?: number
    /**
     * Cache configuration for this read.
     */
    cache?: CacheOptions
    /**
     * Include soft-deleted entities.
     * @default false
     */
    includeSoftDeleted?: boolean
    /**
     * Select specific fields (projection).
     */
    select?: (keyof T)[]
}

/**
 * Batch read options for fetching multiple entities by ID.
 */
export interface BatchReadOptions<T extends BaseEntity = BaseEntity>
    extends Omit<ReadOptions<T>, 'id' | 'filter'> {
    /**
     * Array of IDs to fetch.
     */
    ids: string[]
    /**
     * Continue processing if some IDs are not found.
     * @default true
     */
    continueOnMissing?: boolean
}

/**
 * Cache configuration options.
 */
export interface CacheOptions {
    /**
     * Whether to use cache for this operation.
     * @default true
     */
    enabled?: boolean
    /**
     * Time-to-live in milliseconds.
     * @default 60000 (1 minute)
     */
    ttl?: number
    /**
     * Force refresh from source, updating cache.
     * @default false
     */
    forceRefresh?: boolean
    /**
     * Use stale-while-revalidate pattern.
     * @default true
     */
    staleWhileRevalidate?: boolean
    /**
     * Custom cache key override.
     */
    key?: string
}

/**
 * Options for update operations.
 * @template T - The entity type being updated
 */
export interface UpdateOptions<T extends BaseEntity = BaseEntity> {
    /**
     * Merge with existing data (shallow merge).
     * @default true
     */
    merge?: boolean
    /**
     * Enable optimistic update.
     * @default false
     */
    optimistic?: boolean
    /**
     * Previous value for optimistic rollback.
     */
    previousValue?: T
    /**
     * Callback when optimistic update settles.
     */
    onOptimisticSettled?: (result: CrudResult<T>, rolledBack: boolean) => void
    /**
     * Validation function.
     */
    validate?: (data: Partial<T>) => ValidationResult
    /**
     * Transform data before storage.
     */
    transform?: (data: Partial<T>) => Partial<T>
    /**
     * Condition for optimistic locking.
     */
    where?: (current: T) => boolean
}

/**
 * Batch update options.
 * @template T - The entity type being updated
 */
export interface BatchUpdateOptions<T extends BaseEntity = BaseEntity>
    extends Omit<UpdateOptions<T>, 'previousValue' | 'onOptimisticSettled' | 'where'> {
    /**
     * Continue processing if one update fails.
     * @default true
     */
    continueOnError?: boolean
    /**
     * Maximum concurrent updates.
     * @default 10
     */
    concurrency?: number
    /**
     * Progress callback.
     */
    onProgress?: (progress: BatchProgress) => void
}

/**
 * Input for batch update operations.
 * @template T - The entity type being updated
 */
export interface BatchUpdateInput<T extends BaseEntity> {
    /** ID of entity to update */
    id: string
    /** Partial data to update */
    data: Partial<T>
}

// ============================================================================
// DELETE TYPES
// ============================================================================

/**
 * Options for delete operations.
 */
export interface DeleteOptions {
    /**
     * Perform soft delete instead of hard delete.
     * @default false
     */
    soft?: boolean
    /**
     * Delete related entities recursively (for hierarchical data).
     * @default false
     */
    recursive?: boolean
    /**
     * Enable optimistic delete.
     * @default false
     */
    optimistic?: boolean
    /**
     * Callback when optimistic delete settles.
     */
    onOptimisticSettled?: (result: CrudResult<boolean>, rolledBack: boolean) => void
    /**
     * Cascade delete related entities.
     */
    cascade?: CascadeConfig
}

/**
 * Batch delete options.
 */
export interface BatchDeleteOptions extends Omit<DeleteOptions, 'onOptimisticSettled'> {
    /**
     * Continue processing if one delete fails.
     * @default true
     */
    continueOnError?: boolean
    /**
     * Maximum concurrent deletes.
     * @default 10
     */
    concurrency?: number
    /**
     * Progress callback.
     */
    onProgress?: (progress: BatchProgress) => void
}

/**
 * Cascade delete configuration.
 */
export interface CascadeConfig {
    /** Storage keys of related entities to cascade delete */
    relations: string[]
    /** Foreign key field name */
    foreignKey: string
}

// ============================================================================
// SHARED TYPES
// ============================================================================

/**
 * Validation result from validate functions.
 */
export interface ValidationResult {
    /** Whether validation passed */
    valid: boolean
    /** Validation errors if invalid */
    errors?: ValidationError[]
}

/**
 * Individual validation error.
 */
export interface ValidationError {
    /** Field that failed validation */
    field: string
    /** Error message */
    message: string
    /** Error code */
    code: string
}

/**
 * Progress update for batch operations.
 */
export interface BatchProgress {
    /** Current operation index */
    current: number
    /** Total operations */
    total: number
    /** Percentage complete (0-100) */
    percentage: number
    /** Estimated time remaining in ms */
    estimatedTimeRemaining?: number
}

/**
 * Cache entry structure for internal cache storage.
 * @template T - The cached data type
 */
export interface CacheEntry<T> {
    /** Cached data */
    data: T
    /** When the entry was cached */
    cachedAt: number
    /** When the entry expires */
    expiresAt: number
    /** Whether the entry is stale */
    stale: boolean
    /** Cache key */
    key: string
}

/**
 * Storage key constants for type-safe storage access.
 */
export const STORAGE_KEYS = {
    NOTES: 'notes',
    FOLDERS: 'folders',
    TASKS: 'tasks',
    SETTINGS: 'settings',
    SHORTCUTS: 'shortcuts',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
