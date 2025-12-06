/**
 * @fileoverview ID generation utilities
 * @module @skriuw/crud/utils/id
 */

/**
 * Generates a unique entity ID.
 */
export function generateEntityId(prefix?: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 9)
    return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`
}

/**
 * Generates a unique request ID.
 */
export function generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
