/**
 * @fileoverview User ownership utilities for database tables
 * @description Provides reusable columns, types, and helpers for user-scoped entities.
 * This ensures DRY patterns across all user-owned tables.
 */

import { text, index } from 'drizzle-orm/pg-core'
import type { AnyPgColumn, PgTableWithColumns } from 'drizzle-orm/pg-core'

/**
 * Standard columns for user-owned entities.
 * Use spread syntax in table definitions.
 * 
 * @example
 * ```typescript
 * export const notes = pgTable('notes', {
 *   id: text('id').primaryKey(),
 *   ...createUserOwnershipColumn(user),
 *   // ... other columns
 * })
 * ```
 */
export function createUserOwnershipColumn(
    userTable: PgTableWithColumns<{ id: AnyPgColumn }>
) {
    return {
        userId: text('user_id').references(() => userTable.id),
    }
}

/**
 * Creates a standard user index for a table.
 * Use in table index definitions.
 * 
 * @param tableName - The name of the table (used for index naming)
 * @param userIdColumn - The userId column reference
 */
export function createUserIndex(tableName: string, userIdColumn: AnyPgColumn) {
    return index(`${tableName}_user_id_idx`).on(userIdColumn)
}

/**
 * Creates a composite index for user + another column.
 * Useful for queries like "all notes for user X in folder Y".
 * 
 * @param tableName - The name of the table
 * @param indexSuffix - Suffix for the index name (e.g., 'parent', 'note')
 * @param userIdColumn - The userId column reference
 * @param secondColumn - The second column for the composite index
 */
export function createUserCompositeIndex(
    tableName: string,
    indexSuffix: string,
    userIdColumn: AnyPgColumn,
    secondColumn: AnyPgColumn
) {
    return index(`${tableName}_user_${indexSuffix}_idx`).on(userIdColumn, secondColumn)
}

// ============================================================================
// TYPE UTILITIES
// ============================================================================

/**
 * Type helper for user-owned entities.
 * Adds userId to any existing type.
 */
export type WithUserId<T> = T & { userId: string | null }

/**
 * Type helper for entities that require a userId (non-nullable).
 */
export type RequireUserId<T> = T & { userId: string }

/**
 * Type guard to check if an entity has a valid userId.
 * Useful for filtering or validation.
 * 
 * @example
 * ```typescript
 * const notes = await getNotes()
 * const userNotes = notes.filter(hasUserId)
 * // userNotes is typed as RequireUserId<Note>[]
 * ```
 */
export function hasUserId<T extends { userId?: string | null }>(
    entity: T
): entity is T & { userId: string } {
    return typeof entity.userId === 'string' && entity.userId.length > 0
}

/**
 * Validates that a userId is present and valid.
 * Throws an error if not.
 * 
 * @param userId - The userId to validate
 * @param context - Optional context for error message
 * @throws Error if userId is null, undefined, or empty
 */
export function requireUserId(userId: string | null | undefined, context?: string): string {
    if (!userId || userId.trim().length === 0) {
        const message = context
            ? `User ID is required for ${context}`
            : 'User ID is required'
        throw new Error(message)
    }
    return userId
}
