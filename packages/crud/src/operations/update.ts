import { getAdapter } from '../adapter'
import * as cache from '../cache'
import { createCrudError, createValidationError, createNotFoundError } from '../errors'
import type {
	BaseEntity,
	CrudResult,
	BatchCrudResult,
	UpdateOptions,
	BatchUpdateOptions,
	BatchUpdateInput
} from '../types'
import { generateRequestId } from '../utils/id'
import { successResult, errorResult } from '../utils/result'

/**
 * Updates an existing entity.
 *
 * @template T - Entity type
 * @param storageKey - Storage collection key
 * @param id - Entity ID
 * @param data - Partial data to update
 * @param options - Update options
 * @returns CrudResult with updated entity
 *
 * @example
 * ```typescript
 * const result = await update<Note>('notes', 'note-123', {
 *   name: 'Updated Name'
 * }, {
 *   optimistic: true,
 *   previousValue: existingNote
 * })
 * ```
 */
export async function update<T extends BaseEntity>(
	storageKey: string,
	id: string,
	data: Partial<T>,
	options?: UpdateOptions<T>
): Promise<CrudResult<T>> {
	const startTime = Date.now()
	const cacheKey = cache.generateKey(storageKey, { id })

	try {
		if (options?.validate) {
			const validation = options.validate(data)
			if (!validation.valid) {
				return errorResult<T>(createValidationError(validation.errors ?? []), startTime)
			}
		}

		const transformedData = options?.transform ? options.transform(data) : data

		const updateData = {
			...transformedData,
			updatedAt: Date.now()
		}

		if (options?.optimistic && options?.previousValue) {
			const optimisticEntity = { ...options.previousValue, ...updateData } as T

			queueMicrotask(async () => {
				try {
					const actual = await getAdapter().update<T>(storageKey, id, updateData, options)
					cache.invalidate(cacheKey)
					cache.invalidateForStorageKey(storageKey)
					if (actual) {
						options.onOptimisticSettled?.(
							successResult(actual, startTime, { optimistic: true }),
							false
						)
					} else {
						options.onOptimisticSettled?.(
							errorResult<T>(createNotFoundError(storageKey, id), startTime),
							true
						)
					}
				} catch (error) {
					options.onOptimisticSettled?.(
						errorResult<T>(createCrudError(error), startTime),
						true
					)
				}
			})

			return successResult(optimisticEntity, startTime, { optimistic: true })
		}

		if (options?.where) {
			const current = await getAdapter().read<T>(storageKey, { getById: id })
			const currentEntity = Array.isArray(current) ? current[0] : current

			if (!currentEntity) {
				return errorResult<T>(createNotFoundError(storageKey, id), startTime)
			}

			if (!options.where(currentEntity)) {
				return errorResult<T>(
					{
						code: 'CONSTRAINT_VIOLATION',
						message: 'Update condition not met (optimistic lock failure)'
					},
					startTime
				)
			}
		}

		// Standard update
		const updated = await getAdapter().update<T>(storageKey, id, updateData, options)

		if (!updated) {
			return errorResult<T>(createNotFoundError(storageKey, id), startTime)
		}

		cache.invalidate(cacheKey)
		cache.invalidateForStorageKey(storageKey)

		return successResult(updated, startTime)
	} catch (error) {
		return errorResult<T>(createCrudError(error), startTime)
	}
}

/**
 * Updates multiple entities in batch.
 */
export async function batchUpdate<T extends BaseEntity>(
	storageKey: string,
	updates: BatchUpdateInput<T>[],
	options?: BatchUpdateOptions<T>
): Promise<BatchCrudResult<T>> {
	const startTime = Date.now()
	const requestId = generateRequestId()
	const results: CrudResult<T>[] = []
	const concurrency = options?.concurrency ?? 10
	const continueOnError = options?.continueOnError ?? true

	let succeeded = 0
	let failed = 0

	for (let i = 0; i < updates.length; i += concurrency) {
		const batch = updates.slice(i, i + concurrency)

		const batchResults = await Promise.allSettled(
			batch.map((item) =>
				update<T>(storageKey, item.id, item.data, {
					validate: options?.validate,
					transform: options?.transform,
					merge: options?.merge
				})
			)
		)

		for (const result of batchResults) {
			if (result.status === 'fulfilled') {
				results.push(result.value)
				if (result.value.success) succeeded++
				else {
					failed++
					if (!continueOnError) {
						return {
							success: false,
							results,
							summary: {
								total: updates.length,
								succeeded,
								failed,
								skipped: updates.length - i - batch.length
							},
							meta: {
								timestamp: startTime,
								duration: Date.now() - startTime,
								fromCache: false,
								optimistic: false,
								requestId
							}
						}
					}
				}
			} else {
				failed++
				results.push(errorResult<T>(createCrudError(result.reason), startTime))
			}
		}

		options?.onProgress?.({
			current: Math.min(i + concurrency, updates.length),
			total: updates.length,
			percentage: Math.round(
				(Math.min(i + concurrency, updates.length) / updates.length) * 100
			)
		})
	}

	cache.invalidateForStorageKey(storageKey)

	return {
		success: failed === 0,
		results,
		summary: { total: updates.length, succeeded, failed, skipped: 0 },
		meta: {
			timestamp: startTime,
			duration: Date.now() - startTime,
			fromCache: false,
			optimistic: false,
			requestId
		}
	}
}
