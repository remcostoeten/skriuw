/**
 * @fileoverview Base entity and result types for CRUD operations
 * @module @skriuw/crud/types/base
 */

/**
 * Base entity type that all storable entities must extend.
 */
export interface BaseEntity {
    /** Unique identifier */
    id: string
    /** Unix timestamp (ms) when created */
    createdAt: number
    /** Unix timestamp (ms) when last updated */
    updatedAt: number
}

/**
 * Result wrapper for all CRUD operations.
 * @template T - The entity type being operated on
 */
export interface CrudResult<T> {
    /** Whether the operation succeeded */
    success: boolean
    /** The resulting data */
    data: T | null
    /** Error information if failed */
    error?: {
        code: string
        message: string
        details?: Record<string, unknown>
        stack?: string
    }
    /** Operation metadata */
    meta: CrudMeta
}

/**
 * Result wrapper for batch operations.
 * @template T - The entity type being operated on
 */
export interface BatchCrudResult<T> {
    /** Whether all operations succeeded */
    success: boolean
    /** Individual results */
    results: CrudResult<T>[]
    /** Batch summary */
    summary: BatchSummary
    /** Overall metadata */
    meta: CrudMeta
}

/**
 * Summary statistics for batch operations.
 */
export interface BatchSummary {
    total: number
    succeeded: number
    failed: number
    skipped: number
}

/**
 * Metadata for CRUD operation results.
 */
export interface CrudMeta {
    /** When operation started */
    timestamp: number
    /** Duration in milliseconds */
    duration: number
    /** Whether from cache */
    fromCache: boolean
    /** Whether optimistic */
    optimistic: boolean
    /** Request ID for tracing */
    requestId: string
    /** Cache key if applicable */
    cacheKey?: string
}

/**
 * Progress update for batch operations.
 */
export interface BatchProgress {
    current: number
    total: number
    percentage: number
    estimatedTimeRemaining?: number
}

/**
 * Validation result from validate functions.
 */
export interface ValidationResult {
    valid: boolean
    errors?: ValidationError[]
}

/**
 * Individual validation error.
 */
export interface ValidationError {
    field: string
    message: string
    code: string
}
