/**
 * @fileoverview Read operation
 * @module @skriuw/crud/operations/read
 */

import type { BaseEntity, CrudResult, BatchCrudResult, ReadOptions, BatchReadOptions } from '../types'
import { createCrudError, createNotFoundError } from '../errors'
import { getAdapter } from '../adapter'
import * as cache from '../cache'
import { generateRequestId } from '../utils/id'
import { successResult, errorResult } from '../utils/result'

/**
 * Reads a single entity by ID.
 *
 * @template T - Entity type
 * @param storageKey - Storage collection key
 * @param id - Entity ID
 * @param options - Read options
 * @returns CrudResult with entity or null
 *
 * @example
 * ```typescript
 * const result = await readOne<Note>('notes', 'note-123', {
 *   cache: { ttl: 60000, staleWhileRevalidate: true }
 * })
 * ```
 */
export async function readOne<T extends BaseEntity>(
    storageKey: string,
    id: string,
    options?: Pick<ReadOptions<T>, 'cache' | 'userId'>
): Promise<CrudResult<T>> {
    const startTime = Date.now()
    const cacheKey = cache.generateKey(storageKey, { id })

    try {
        // Check cache
        const cached = cache.get<T>(cacheKey, {
            forceRefresh: options?.cache?.forceRefresh,
            staleWhileRevalidate: options?.cache?.staleWhileRevalidate ?? true,
        })

        if (cached) {
            // Background revalidation
            if (cached.stale && !cache.isRevalidating(cacheKey)) {
                const promise = revalidateOne<T>(storageKey, id, cacheKey, options?.cache?.ttl)
                cache.registerRevalidation(cacheKey, promise)
            }

            return successResult(cached.data, startTime, { fromCache: true, cacheKey })
        }

        // Fetch from storage
        const result = await getAdapter().read<T>(storageKey, { getById: id, ...options })

        if (!result || (Array.isArray(result) && result.length === 0)) {
            return errorResult<T>(createNotFoundError(storageKey, id), startTime)
        }

        const entity = Array.isArray(result) ? result[0] : result

        if (options?.cache?.enabled !== false) {
            cache.set(cacheKey, entity, options?.cache?.ttl)
        }

        return successResult(entity, startTime, { cacheKey })
    } catch (error) {
        return errorResult<T>(createCrudError(error), startTime)
    }
}

/**
 * Reads multiple entities with filtering and pagination.
 *
 * @template T - Entity type
 * @param storageKey - Storage collection key
 * @param options - Read options
 * @returns CrudResult with entity array
 *
 * @example
 * ```typescript
 * const result = await readMany<Note>('notes', {
 *   filter: (n) => n.parentFolderId === 'folder-1',
 *   sort: (a, b) => b.updatedAt - a.updatedAt,
 *   limit: 50
 * })
 * ```
 */
export async function readMany<T extends BaseEntity>(
    storageKey: string,
    options?: ReadOptions<T>
): Promise<CrudResult<T[]>> {
    const startTime = Date.now()
    const cacheParams = { limit: options?.limit, offset: options?.offset }
    const cacheKey = options?.cache?.key ?? cache.generateKey(storageKey, cacheParams)

    try {
        // Check cache (only without dynamic filter)
        if (!options?.filter) {
            const cached = cache.get<T[]>(cacheKey, {
                forceRefresh: options?.cache?.forceRefresh,
                staleWhileRevalidate: options?.cache?.staleWhileRevalidate ?? true,
            })

            if (cached) {
                let result = cached.data
                if (options?.sort) result = [...result].sort(options.sort)

                if (cached.stale && !cache.isRevalidating(cacheKey)) {
                    const promise = revalidateMany<T>(storageKey, options, cacheKey)
                    cache.registerRevalidation(cacheKey, promise)
                }

                return successResult(result, startTime, { fromCache: true, cacheKey })
            }
        }

        // Fetch from storage
        const result = await getAdapter().read<T>(storageKey, { getAll: true, ...options })
        let entities = Array.isArray(result) ? result : result ? [result] : []

        // Apply filter
        if (options?.filter) {
            entities = entities.filter(options.filter)
        }

        // Apply sort
        if (options?.sort) {
            entities = [...entities].sort(options.sort)
        }

        // Apply pagination
        if (options?.offset !== undefined || options?.limit !== undefined) {
            const start = options.offset ?? 0
            const end = options.limit !== undefined ? start + options.limit : undefined
            entities = entities.slice(start, end)
        }

        // Cache (only without dynamic filter)
        if (!options?.filter && options?.cache?.enabled !== false) {
            cache.set(cacheKey, entities, options?.cache?.ttl)
        }

        return successResult(entities, startTime, { cacheKey })
    } catch (error) {
        return errorResult<T[]>(createCrudError(error), startTime)
    }
}

/**
 * Reads multiple entities by ID.
 *
 * @template T - Entity type
 * @param storageKey - Storage collection key
 * @param options - Batch read options with IDs
 * @returns BatchCrudResult with all results
 */
export async function batchRead<T extends BaseEntity>(
    storageKey: string,
    options: BatchReadOptions<T>
): Promise<BatchCrudResult<T>> {
    const startTime = Date.now()
    const requestId = generateRequestId()
    const results: CrudResult<T>[] = []
    const continueOnMissing = options.continueOnMissing ?? true

    let succeeded = 0
    let failed = 0

    for (const id of options.ids) {
        const result = await readOne<T>(storageKey, id, { cache: options.cache })
        results.push(result)

        if (result.success) succeeded++
        else {
            failed++
            if (!continueOnMissing) break
        }
    }

    return {
        success: failed === 0,
        results,
        summary: { total: options.ids.length, succeeded, failed, skipped: 0 },
        meta: { timestamp: startTime, duration: Date.now() - startTime, fromCache: false, optimistic: false, requestId },
    }
}

// Background revalidation
async function revalidateOne<T extends BaseEntity>(
    storageKey: string,
    id: string,
    cacheKey: string,
    ttl?: number
): Promise<void> {
    try {
        const result = await getAdapter().read<T>(storageKey, { getById: id })
        if (result && (!Array.isArray(result) || result.length > 0)) {
            const entity = Array.isArray(result) ? result[0] : result
            cache.set(cacheKey, entity, ttl)
        }
    } catch {
        // Silent fail for background revalidation
    }
}

async function revalidateMany<T extends BaseEntity>(
    storageKey: string,
    options: ReadOptions<T> | undefined,
    cacheKey: string
): Promise<void> {
    try {
        const result = await getAdapter().read<T>(storageKey, { getAll: true })
        let entities = Array.isArray(result) ? result : result ? [result] : []

        if (options?.sort) entities = [...entities].sort(options.sort)
        if (options?.offset !== undefined || options?.limit !== undefined) {
            const start = options.offset ?? 0
            const end = options.limit !== undefined ? start + options.limit : undefined
            entities = entities.slice(start, end)
        }

        cache.set(cacheKey, entities, options?.cache?.ttl)
    } catch {
        // Silent fail for background revalidation
    }
}
