/**
 * @fileoverview Result factory utilities
 * @module @skriuw/crud/utils/result
 */

import type { CrudResult, CrudMeta } from '../types'
import type { CrudError } from '../errors'
import { createMeta } from './meta'

/**
 * Creates a success result.
 */
export function successResult<T>(
    data: T,
    startTime: number,
    options?: { fromCache?: boolean; optimistic?: boolean; cacheKey?: string }
): CrudResult<T> {
    return {
        success: true,
        data,
        meta: createMeta(startTime, options),
    }
}

/**
 * Creates an error result.
 */
export function errorResult<T>(
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
