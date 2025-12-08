/**
 * @fileoverview Metadata utilities
 * @module @skriuw/crud/utils/meta
 */

import type { CrudMeta } from '../types'
import { generateRequestId } from './id'

/**
 * Creates metadata for operation results.
 */
export function createMeta(
    startTime: number,
    options?: {
        fromCache?: boolean
        optimistic?: boolean
        cacheKey?: string
    }
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
