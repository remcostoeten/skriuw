/**
 * @fileoverview Enterprise CRUD Layer - Update Operations
 * @description High-performance update operations with optimistic updates,
 * validation, batching, and cache invalidation.
 * @module lib/storage/crud/update
 */

import { getGenericStorage } from '../generic-storage-factory'
import type { BaseEntity } from '../generic-types'
import { invalidateCacheForStorageKey, invalidateCache, generateCacheKey } from './cache'
import type {
	CrudResult,
	BatchCrudResult,
	CrudMeta,
	CrudError,
	UpdateOptions,
	BatchUpdateOptions,
	BatchUpdateInput,
	BatchProgress,
} from './types'


/**
 * Generates a unique request ID for tracing.
 */
function generateRequestId(): string {
	return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Creates metadata for operation results.
 */
function createMeta(
	startTime: number,
	options?: { fromCache?: boolean; optimistic?: boolean; cacheKey?: string }
): CrudMeta {
	return {
		timestamp: startTime,
		duration: Date.now() - startTime,
		fromCache: options?.fromCache ?? false,
		optimistic: options?.optimistic ?? false,
		requestId: generateRequestId(),
		cacheKey: options?.cacheKey,
	}
}

/**
 * Creates an error result.
 */
function createErrorResult<T>(
	error: CrudError,
	startTime: number
): CrudResult<T> {
	return {
		success: false,
		data: null,
		error,
		meta: createMeta(startTime),
	}
}

/**
 * Updates an existing entity with enterprise-grade features.
 * 
 * @template T - Entity type extending BaseEntity
 * @param storageKey - Storage collection key (e.g., 'notes', 'folders')
 * @param id - Entity ID to update
 * @param data - Partial entity data to update
 * @param options - Update options for validation, merging, and optimistic updates
 * @returns Promise resolving to CrudResult with updated entity
 * 
 * @example
 * ```typescript
 * // Basic update
 * const result = await update<Note>('notes', 'note-123', {
 *   name: 'Updated Name',
 *   content: '...'
 * })
 * 
 * if (result.success) {
 *   console.log('Updated:', result.data)
 * }
 * ```
 * 
 * @example
 * ```typescript
 * // Optimistic update with rollback
 * const result = await update<Note>('notes', 'note-123', { name: 'New Name' }, {
 *   optimistic: true,
 *   previousValue: currentNote,
 *   onOptimisticSettled: (res, rolledBack) => {
 *     if (rolledBack) {
 *       toast.error('Failed to save, changes reverted')
 *     }
 *   }
 * })
 * ```
 * 
 * @example
 * ```typescript
 * // With validation and transformation
 * const result = await update<Note>('notes', 'note-123', data, {
 *   validate: (data) => ({
 *     valid: !data.name || data.name.length > 0,
 *     errors: data.name?.length === 0 ? [{ field: 'name', message: 'Cannot be empty', code: 'EMPTY' }] : []
 *   }),
 *   transform: (data) => ({
 *     ...data,
 *     name: data.name?.trim()
 *   })
 * })
 * ```
 * 
 * @throws Never throws - all errors are captured in the result
 */
export async function update<T extends BaseEntity>(
	storageKey: string,
	id: string,
	data: Partial<T>,
	options?: UpdateOptions<T>
): Promise<CrudResult<T>> {
	const startTime = Date.now()
	const cacheKey = generateCacheKey(storageKey, { id })

	try {
		// Validate if validator provided
		if (options?.validate) {
			const validation = options.validate(data)
			if (!validation.valid) {
				return createErrorResult<T>(
					{
						code: 'VALIDATION_ERROR',
						message: 'Validation failed',
						details: { errors: validation.errors },
					},
					startTime
				)
			}
		}

		// Transform data if transformer provided
		let transformedData = data
		if (options?.transform) {
			transformedData = options.transform(data)
		}

		const storage = getGenericStorage()
		const now = Date.now()

		// Add updated timestamp
		const updateData = {
			...transformedData,
			updatedAt: now,
		}

		// Optimistic update handling
		if (options?.optimistic && options?.previousValue) {
			// Return immediately with optimistic result
			const optimisticEntity = {
				...options.previousValue,
				...updateData,
			} as T

			// Schedule background sync
			queueMicrotask(async () => {
				try {
					const actualResult = await storage.update<T>(storageKey, id, updateData)

					// Invalidate caches
					invalidateCache(cacheKey)
					invalidateCacheForStorageKey(storageKey)

					options.onOptimisticSettled?.(
						{
							success: true,
							data: actualResult ?? null,
							meta: createMeta(startTime, { optimistic: true }),
						},
						false
					)
				} catch (error) {
					// Rollback needed - notify caller
					options.onOptimisticSettled?.(
						{
							success: false,
							data: null,
							error: {
								code: 'INTERNAL_ERROR',
								message: error instanceof Error ? error.message : String(error),
							},
							meta: createMeta(startTime, { optimistic: true }),
						},
						true
					)
				}
			})

			return {
				success: true,
				data: optimisticEntity,
				meta: createMeta(startTime, { optimistic: true }),
			}
		}

		// Check condition if provided (optimistic locking)
		if (options?.where) {
			const current = await storage.read<T>(storageKey, { getById: id })
			const currentEntity = Array.isArray(current) ? current[0] : current

			if (!currentEntity) {
				return createErrorResult<T>(
					{
						code: 'NOT_FOUND',
						message: `Entity with ID '${id}' not found in '${storageKey}'`,
					},
					startTime
				)
			}

			if (!options.where(currentEntity)) {
				return createErrorResult<T>(
					{
						code: 'CONSTRAINT_VIOLATION',
						message: 'Update condition not met (optimistic lock failure)',
					},
					startTime
				)
			}
		}

		// Standard synchronous update
		const updated = await storage.update<T>(storageKey, id, updateData)

		if (!updated) {
			return createErrorResult<T>(
				{
					code: 'NOT_FOUND',
					message: `Entity with ID '${id}' not found in '${storageKey}'`,
				},
				startTime
			)
		}

		// Invalidate caches
		invalidateCache(cacheKey)
		invalidateCacheForStorageKey(storageKey)

		return {
			success: true,
			data: updated,
			meta: createMeta(startTime),
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)

		// Detect specific error types
		let errorCode: CrudError['code'] = 'INTERNAL_ERROR'
		if (errorMessage.includes('not found')) {
			errorCode = 'NOT_FOUND'
		} else if (errorMessage.includes('constraint')) {
			errorCode = 'CONSTRAINT_VIOLATION'
		} else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
			errorCode = 'NETWORK_ERROR'
		}

		return createErrorResult<T>(
			{
				code: errorCode,
				message: errorMessage,
				stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined,
			},
			startTime
		)
	}
}

/**
 * Updates multiple entities in a single batch operation with concurrency control.
 * 
 * @template T - Entity type extending BaseEntity
 * @param storageKey - Storage collection key
 * @param updates - Array of update inputs (id + partial data)
 * @param options - Batch update options
 * @returns Promise resolving to BatchCrudResult with all results
 * 
 * @example
 * ```typescript
 * // Batch update with progress tracking
 * const result = await batchUpdate<Note>('notes', [
 *   { id: 'note-1', data: { name: 'Updated 1' } },
 *   { id: 'note-2', data: { name: 'Updated 2' } },
 * ], {
 *   concurrency: 5,
 *   continueOnError: true,
 *   onProgress: (progress) => {
 *     console.log(`${progress.percentage}% complete`)
 *   }
 * })
 * 
 * console.log(`Updated ${result.summary.succeeded} of ${result.summary.total}`)
 * ```
 */
export async function batchUpdate<T extends BaseEntity>(
	storageKey: string,
	updates: BatchUpdateInput<T>[],
	options?: BatchUpdateOptions<T>
): Promise<BatchCrudResult<T>> {
	const startTime = Date.now()
	const results: CrudResult<T>[] = []
	const concurrency = options?.concurrency ?? 10
	const continueOnError = options?.continueOnError ?? true

	let succeeded = 0
	let failed = 0

	// Process in concurrent batches
	for (let i = 0; i < updates.length; i += concurrency) {
		const batch = updates.slice(i, i + concurrency)

		const batchResults = await Promise.allSettled(
			batch.map((item) =>
				update<T>(storageKey, item.id, item.data, {
					validate: options?.validate,
					transform: options?.transform,
					merge: options?.merge,
				})
			)
		)

		for (const result of batchResults) {
			if (result.status === 'fulfilled') {
				results.push(result.value)
				if (result.value.success) {
					succeeded++
				} else {
					failed++
					if (!continueOnError) {
						return {
							success: false,
							results,
							summary: { total: updates.length, succeeded, failed, skipped: updates.length - i - batch.length },
							meta: createMeta(startTime),
						}
					}
				}
			} else {
				failed++
				results.push(createErrorResult<T>(
					{
						code: 'INTERNAL_ERROR',
						message: result.reason?.message ?? 'Unknown error',
					},
					startTime
				))
			}
		}

		// Report progress
		if (options?.onProgress) {
			const progress: BatchProgress = {
				current: Math.min(i + concurrency, updates.length),
				total: updates.length,
				percentage: Math.round((Math.min(i + concurrency, updates.length) / updates.length) * 100),
			}
			options.onProgress(progress)
		}
	}

	// Invalidate storage key cache once after all updates
	invalidateCacheForStorageKey(storageKey)

	return {
		success: failed === 0,
		results,
		summary: { total: updates.length, succeeded, failed, skipped: 0 },
		meta: createMeta(startTime),
	}
}


export type { UpdateOptions, BatchUpdateOptions, BatchUpdateInput }
