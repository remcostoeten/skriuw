/**
 * @fileoverview User Context for CRUD Operations
 * @description Provides user context management for scoping CRUD operations.
 * Allows operations to be transparently filtered by the current user.
 * @module @skriuw/crud/context
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * User context for scoping CRUD operations.
 * When userId is provided, operations are filtered to that user's data.
 */
export interface UserContext {
    /**
     * The current user's ID.
     * - `string`: Filter operations to this user
     * - `null`: Explicitly no user (anonymous/guest)
     * - `undefined`: No user context set (return all data)
     */
    userId?: string | null
}

// ============================================================================
// CONTEXT STORAGE
// ============================================================================

/**
 * Current user context.
 * In a server environment, this should be set per-request.
 * In a browser environment, this persists for the session.
 */
let currentContext: UserContext = {}

/**
 * Sets the current user context for CRUD operations.
 * Call this at the start of each request/session.
 *
 * @param ctx - The user context to set
 *
 * @example
 * ```typescript
 * // In an API route handler
 * const session = await auth.getSession(req)
 * setUserContext({ userId: session?.user?.id })
 * ```
 */
export function setUserContext(ctx: UserContext): void {
    currentContext = ctx
}

/**
 * Gets the current user context.
 *
 * @returns The current user context
 */
export function getUserContext(): UserContext {
    return currentContext
}

/**
 * Clears the current user context.
 * Call this at the end of each request to prevent context leakage.
 */
export function clearUserContext(): void {
    currentContext = {}
}

/**
 * Gets the current user ID from context.
 * Convenience function for extracting just the userId.
 *
 * @returns The current user ID or undefined
 */
export function getCurrentUserId(): string | null | undefined {
    return currentContext.userId
}

// ============================================================================
// CONTEXT UTILITIES
// ============================================================================

/**
 * Executes a function with a specific user context.
 * Automatically restores the previous context after execution.
 *
 * @template T - Return type of the function
 * @param userId - The user ID to use for the operation
 * @param fn - The async function to execute
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const notes = await withUser('user-123', async () => {
 *   return await readMany<Note>('notes')
 * })
 * // notes are filtered to user-123
 * ```
 */
export async function withUser<T>(
    userId: string | null,
    fn: () => Promise<T>
): Promise<T> {
    const previousContext = currentContext
    currentContext = { ...previousContext, userId }

    try {
        return await fn()
    } finally {
        currentContext = previousContext
    }
}

/**
 * Synchronous version of withUser for non-async operations.
 *
 * @template T - Return type of the function
 * @param userId - The user ID to use
 * @param fn - The function to execute
 * @returns The result of the function
 */
export function withUserSync<T>(
    userId: string | null,
    fn: () => T
): T {
    const previousContext = currentContext
    currentContext = { ...previousContext, userId }

    try {
        return fn()
    } finally {
        currentContext = previousContext
    }
}

/**
 * Creates a scoped context that doesn't affect the global context.
 * Useful for parallel operations that need different user contexts.
 *
 * @param ctx - The user context to use
 * @returns Functions that operate within this context
 */
export function createScopedContext(ctx: UserContext) {
    return {
        getUserId: () => ctx.userId,
        getContext: () => ctx,
    }
}
