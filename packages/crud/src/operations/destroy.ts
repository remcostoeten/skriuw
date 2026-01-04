/**
 * @fileoverview Delete operation
 * @module @skriuw/crud/operations/destroy
 */

import type { BaseEntity, CrudResult, BatchCrudResult, DeleteOptions, BatchDeleteOptions } from '../types'
import { createCrudError, createNotFoundError } from '../errors'
import { getAdapter } from '../adapter'
import * as cache from '../cache'
import { generateRequestId } from '../utils/id'
import { successResult, errorResult } from '../utils/result'

/** Max recursion depth to prevent stack overflow */
const MAX_RECURSIVE_DEPTH = 50

/** Default parent key for hierarchical data */
const DEFAULT_PARENT_KEY = 'parentFolderId'

/**
 * Deletes an entity.
 *
 * @param storageKey - Storage collection key
 * @param id - Entity ID
 * @param options - Delete options
 * @returns CrudResult with success boolean
 *
 * @example
 * ```typescript
 * // Hard delete
 * const result = await destroy('notes', 'note-123')
 *
 * // Soft delete
 * const result = await destroy('notes', 'note-123', { soft: true })
 *
 * // Recursive delete (folders)
 * const result = await destroy('folders', 'folder-123', { recursive: true })
 * ```
 */
export async function destroy(
    storageKey: string,
    id: string,
    options?: DeleteOptions
): Promise<CrudResult<boolean>> {
    const startTime = Date.now()
    const cacheKey = cache.generateKey(storageKey, { id })

    try {
        // Optimistic delete
        if (options?.optimistic) {
            queueMicrotask(async () => {
                try {
                    if (options.cascade) {
                        await handleCascadeDelete(options.cascade.relations, options.cascade.foreignKey, id)
                    }

                    if (options.soft) {
                        await getAdapter().update(storageKey, id, {
                            deletedAt: Date.now(),
                            updatedAt: Date.now(),
                        } as unknown as Partial<BaseEntity>)
                    } else {
                        await getAdapter().delete(storageKey, id, options)
                    }

                    cache.invalidate(cacheKey)
                    cache.invalidateForStorageKey(storageKey)
                    options.onOptimisticSettled?.(successResult(true, startTime, { optimistic: true }), false)
                } catch (error) {
                    options.onOptimisticSettled?.(errorResult<boolean>(createCrudError(error), startTime), true)
                }
            })

            return successResult(true, startTime, { optimistic: true })
        }

        // Cascade deletes
        if (options?.cascade) {
            await handleCascadeDelete(options.cascade.relations, options.cascade.foreignKey, id)
        }

        // Recursive delete
        if (options?.recursive) {
            await handleRecursiveDelete(storageKey, id, options.soft, 0)
        }

        // Perform delete
        let deleted: boolean

        if (options?.soft) {
            const updated = await getAdapter().update(storageKey, id, {
                deletedAt: Date.now(),
                updatedAt: Date.now(),
            } as unknown as Partial<BaseEntity>)
            deleted = !!updated
        } else {
            deleted = await getAdapter().delete(storageKey, id, options)
        }

        if (!deleted) {
            return errorResult<boolean>(createNotFoundError(storageKey, id), startTime)
        }

        cache.invalidate(cacheKey)
        cache.invalidateForStorageKey(storageKey)

        return successResult(true, startTime)
    } catch (error) {
        return errorResult<boolean>(createCrudError(error), startTime)
    }
}

/**
 * Deletes multiple entities in batch.
 */
export async function batchDestroy(
    storageKey: string,
    ids: string[],
    options?: BatchDeleteOptions
): Promise<BatchCrudResult<boolean>> {
    const startTime = Date.now()
    const requestId = generateRequestId()
    const results: CrudResult<boolean>[] = []
    const concurrency = options?.concurrency ?? 10
    const continueOnError = options?.continueOnError ?? true

    let succeeded = 0
    let failed = 0

    for (let i = 0; i < ids.length; i += concurrency) {
        const batch = ids.slice(i, i + concurrency)

        const batchResults = await Promise.allSettled(
            batch.map((id) =>
                destroy(storageKey, id, {
                    soft: options?.soft,
                    recursive: options?.recursive,
                    cascade: options?.cascade,
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
                            summary: { total: ids.length, succeeded, failed, skipped: ids.length - i - batch.length },
                            meta: { timestamp: startTime, duration: Date.now() - startTime, fromCache: false, optimistic: false, requestId },
                        }
                    }
                }
            } else {
                failed++
                results.push(errorResult<boolean>(createCrudError(result.reason), startTime))
            }
        }

        options?.onProgress?.({
            current: Math.min(i + concurrency, ids.length),
            total: ids.length,
            percentage: Math.round((Math.min(i + concurrency, ids.length) / ids.length) * 100),
        })
    }

    cache.invalidateForStorageKey(storageKey)

    return {
        success: failed === 0,
        results,
        summary: { total: ids.length, succeeded, failed, skipped: 0 },
        meta: { timestamp: startTime, duration: Date.now() - startTime, fromCache: false, optimistic: false, requestId },
    }
}

// Helpers
async function handleCascadeDelete(
    relations: string[],
    foreignKey: string,
    entityId: string
): Promise<void> {
    for (const relationKey of relations) {
        try {
            const related = await getAdapter().read<BaseEntity & Record<string, unknown>>(relationKey, { getAll: true })

            if (Array.isArray(related)) {
                const toDelete = related.filter((item) => item[foreignKey] === entityId)
                for (const item of toDelete) {
                    await getAdapter().delete(relationKey, item.id)
                }
                if (toDelete.length > 0) {
                    cache.invalidateForStorageKey(relationKey)
                }
            }
        } catch {
            // Continue with other relations - don't fail cascade on single relation error
        }
    }
}

async function handleRecursiveDelete(
    storageKey: string,
    parentId: string,
    soft?: boolean,
    depth = 0
): Promise<void> {
    // Prevent stack overflow
    if (depth >= MAX_RECURSIVE_DEPTH) {
        console.warn(`Recursive delete max depth (${MAX_RECURSIVE_DEPTH}) reached for ${storageKey}:${parentId}`)
        return
    }

    try {
        const all = await getAdapter().read<BaseEntity & Record<string, unknown>>(storageKey, { getAll: true })

        if (Array.isArray(all)) {
            const children = all.filter((item) => item[DEFAULT_PARENT_KEY] === parentId)

            for (const child of children) {
                await handleRecursiveDelete(storageKey, child.id, soft, depth + 1)

                if (soft) {
                    await getAdapter().update(storageKey, child.id, {
                        deletedAt: Date.now(),
                        updatedAt: Date.now(),
                    } as unknown as Partial<BaseEntity>)
                } else {
                    await getAdapter().delete(storageKey, child.id)
                }
            }
        }
    } catch {
        // Don't fail entire operation on recursive delete error
    }
}
