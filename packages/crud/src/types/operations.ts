import type { BaseEntity, BatchProgress, ValidationResult, ValidationError } from './base'

// ============================================================================
// CREATE TYPES
// ============================================================================

/**
 * Input type for creating entities.
 */
export type CreateInput<T extends BaseEntity> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & {
	id?: string
}

/**
 * Options for create operations.
 */
export type CreateOptions<T extends BaseEntity = BaseEntity> = {
	/** Skip duplicate check */
	skipDuplicateCheck?: boolean
	/** Custom ID */
	customId?: string
	/** Enable optimistic update */
	optimistic?: boolean
	/** Callback when optimistic settles */
	onOptimisticSettled?: (result: import('./base').CrudResult<T>) => void
	/** Validation function */
	validate?: (data: CreateInput<T>) => ValidationResult
	/** Transform before storage */
	transform?: (data: CreateInput<T>) => CreateInput<T>
	/** User Context ID */
	userId?: string
}

/**
 * Batch create options.
 */
export type BatchCreateOptions<T extends BaseEntity = BaseEntity> = {
	/** Continue on error */
	continueOnError?: boolean
	/** Max concurrent operations */
	concurrency?: number
	/** Progress callback */
	onProgress?: (progress: BatchProgress) => void
} & Omit<CreateOptions<T>, 'customId' | 'onOptimisticSettled'>

// ============================================================================
// READ TYPES
// ============================================================================

/**
 * Options for read operations.
 */
export type ReadOptions<T extends BaseEntity = BaseEntity> = {
	/** Filter function */
	filter?: (item: T) => boolean
	/** Sort function */
	sort?: (a: T, b: T) => number
	/** Max results */
	limit?: number
	/** Skip count */
	offset?: number
	/** Cache configuration */
	cache?: CacheOptions
	/** Include soft-deleted */
	includeSoftDeleted?: boolean
	/** Field projection */
	select?: (keyof T)[]
	/** User Context ID */
	userId?: string
}

/**
 * Batch read options.
 */
export type BatchReadOptions<T extends BaseEntity = BaseEntity> = {
	/** IDs to fetch */
	ids: string[]
	/** Continue if some missing */
	continueOnMissing?: boolean
} & Omit<ReadOptions<T>, 'filter'>

/**
 * Cache configuration.
 */
export type CacheOptions = {
	/** Enable caching */
	enabled?: boolean
	/** TTL in ms */
	ttl?: number
	/** Force refresh */
	forceRefresh?: boolean
	/** Stale-while-revalidate */
	staleWhileRevalidate?: boolean
	/** Custom cache key */
	key?: string
}

// ============================================================================
// UPDATE TYPES
// ============================================================================

/**
 * Options for update operations.
 */
export type UpdateOptions<T extends BaseEntity = BaseEntity> = {
	/** Merge with existing (shallow) */
	merge?: boolean
	/** Enable optimistic */
	optimistic?: boolean
	/** Previous value for rollback */
	previousValue?: T
	/** Callback when settled */
	onOptimisticSettled?: (result: import('./base').CrudResult<T>, rolledBack: boolean) => void
	/** Validation function */
	validate?: (data: Partial<T>) => ValidationResult
	/** Transform before storage */
	transform?: (data: Partial<T>) => Partial<T>
	/** Optimistic locking condition */
	where?: (current: T) => boolean
	/** User Context ID */
	userId?: string
}

/**
 * Batch update options.
 */
export type BatchUpdateOptions<T extends BaseEntity = BaseEntity> = {
	continueOnError?: boolean
	concurrency?: number
	onProgress?: (progress: BatchProgress) => void
} & Omit<UpdateOptions<T>, 'previousValue' | 'onOptimisticSettled' | 'where'>

/**
 * Batch update input.
 */
export type BatchUpdateInput<T extends BaseEntity> = {
	id: string
	data: Partial<T>
}

// ============================================================================
// DELETE TYPES
// ============================================================================

/**
 * Options for delete operations.
 */
export type DeleteOptions = {
	/** Soft delete */
	soft?: boolean
	/** Recursive (for hierarchical) */
	recursive?: boolean
	/** Enable optimistic */
	optimistic?: boolean
	/** Callback when settled */
	onOptimisticSettled?: (
		result: import('./base').CrudResult<boolean>,
		rolledBack: boolean
	) => void
	/** Cascade config */
	cascade?: CascadeConfig
	/** User Context ID */
	userId?: string
}

/**
 * Batch delete options.
 */
export type BatchDeleteOptions = {
	continueOnError?: boolean
	concurrency?: number
	onProgress?: (progress: BatchProgress) => void
} & Omit<DeleteOptions, 'onOptimisticSettled'>

/**
 * Cascade delete configuration.
 */
export type CascadeConfig = {
	/** Related storage keys */
	relations: string[]
	/** Foreign key field */
	foreignKey: string
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

export const STORAGE_KEYS = {
	NOTES: 'notes',
	FOLDERS: 'folders',
	TASKS: 'tasks',
	SETTINGS: 'settings',
	SHORTCUTS: 'shortcuts'
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
