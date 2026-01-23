import { getAdapter } from "../adapter";
import { invalidateForStorageKey } from "../cache";
import { createCrudError, createValidationError } from "../errors";
import type { BaseEntity, CrudResult, BatchCrudResult, CreateInput, CreateOptions, BatchCreateOptions } from "../types";
import { generateEntityId, generateRequestId } from "../utils/id";
import { successResult, errorResult } from "../utils/result";

/**
 * Creates a new entity.
 *
 * @template T - Entity type
 * @param storageKey - Storage collection key
 * @param data - Entity data (id, createdAt, updatedAt auto-generated)
 * @param options - Create options
 * @returns CrudResult with created entity
 *
 * @example
 * ```typescript
 * const result = await create<Note>('notes', {
 *   name: 'My Note',
 *   content: '...',
 * })
 * ```
 */
export async function create<T extends BaseEntity>(
	storageKey: string,
	data: CreateInput<T>,
	options?: CreateOptions<T>
): Promise<CrudResult<T>> {
	const startTime = Date.now()

	try {
		// Validate
		if (options?.validate) {
			const validation = options.validate(data)
			if (!validation.valid) {
				return errorResult<T>(createValidationError(validation.errors ?? []), startTime)
			}
		}

		// Transform
		const transformedData = options?.transform ? options.transform(data) : data

		// Generate ID
		const entityId = options?.customId ?? data.id ?? generateEntityId(storageKey)
		const now = Date.now()

		const entityToCreate = {
			...transformedData,
			id: entityId,
			createdAt: now,
			updatedAt: now
		} as unknown as Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

		// Optimistic update
		if (options?.optimistic) {
			const optimisticEntity = { ...entityToCreate } as T

			queueMicrotask(async () => {
				try {
					const actual = await getAdapter().create<T>(storageKey, entityToCreate, options)
					invalidateForStorageKey(storageKey)
					options.onOptimisticSettled?.(
						successResult(actual, startTime, { optimistic: true })
					)
				} catch (error) {
					options.onOptimisticSettled?.(errorResult<T>(createCrudError(error), startTime))
				}
			})

			return successResult(optimisticEntity, startTime, { optimistic: true })
		}

		// Standard create
		const created = await getAdapter().create<T>(storageKey, entityToCreate, options)
		invalidateForStorageKey(storageKey)

		return successResult(created, startTime)
	} catch (error) {
		return errorResult<T>(createCrudError(error), startTime)
	}
}

/**
 * Creates multiple entities in batch.
 *
 * @template T - Entity type
 * @param storageKey - Storage collection key
 * @param items - Array of entity data
 * @param options - Batch create options
 * @returns BatchCrudResult with all results
 *
 * @example
 * ```typescript
 * const result = await batchCreate<Note>('notes', notesData, {
 *   concurrency: 5,
 *   onProgress: (p) => console.log(`${p.percentage}%`)
 * })
 * ```
 */
export async function batchCreate<T extends BaseEntity>(
	storageKey: string,
	items: CreateInput<T>[],
	options?: BatchCreateOptions<T>
): Promise<BatchCrudResult<T>> {
	const startTime = Date.now()
	const requestId = generateRequestId()
	const results: CrudResult<T>[] = []
	const concurrency = options?.concurrency ?? 10
	const continueOnError = options?.continueOnError ?? true

	let succeeded = 0
	let failed = 0

	for (let i = 0; i < items.length; i += concurrency) {
		const batch = items.slice(i, i + concurrency)

		const batchResults = await Promise.allSettled(
			batch.map((item) =>
				create<T>(storageKey, item, {
					validate: options?.validate,
					transform: options?.transform,
					skipDuplicateCheck: options?.skipDuplicateCheck
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
								total: items.length,
								succeeded,
								failed,
								skipped: items.length - i - batch.length
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
			current: Math.min(i + concurrency, items.length),
			total: items.length,
			percentage: Math.round((Math.min(i + concurrency, items.length) / items.length) * 100)
		})
	}

	return {
		success: failed === 0,
		results,
		summary: { total: items.length, succeeded, failed, skipped: 0 },
		meta: {
			timestamp: startTime,
			duration: Date.now() - startTime,
			fromCache: false,
			optimistic: false,
			requestId
		}
	}
}
