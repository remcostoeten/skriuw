/**
 * @fileoverview @skriuw/crud - Enterprise CRUD Layer
 * @description High-performance CRUD operations with caching, batching,
 * optimistic updates, validation, and comprehensive error handling.
 *
 * @example
 * ```typescript
 * import { setAdapter, create, readOne, update, destroy } from '@skriuw/crud'
 *
 * // Initialize with your storage adapter
 * setAdapter(myAdapter)
 *
 * // Create
 * const result = await create<Note>('notes', { name: 'My Note' })
 *
 * // Read
 * const note = await readOne<Note>('notes', 'note-123')
 *
 * // Update
 * await update<Note>('notes', 'note-123', { name: 'Updated' })
 *
 * // Delete
 * await destroy('notes', 'note-123')
 * ```
 *
 * @module @skriuw/crud
 */

// ============================================================================
// TYPES
// ============================================================================

export * from './types'

// ============================================================================
// ERRORS
// ============================================================================

export * from './errors'

// ============================================================================
// CACHE
// ============================================================================

export * from './cache'

// ============================================================================
// ADAPTER
// ============================================================================

export {
	setAdapter,
	getAdapter,
	hasAdapter,
	getAdapterCapabilities,
	adapterSupportsBackend,
	isPrivacyModeSafeAdapter,
	resetAdapter
} from './adapter'

// ============================================================================
// USER CONTEXT
// ============================================================================

export {
	setUserContext,
	getUserContext,
	clearUserContext,
	getCrudUserId,
	withUser,
	withUserSync,
	createScopedContext
} from './context'
export type { UserContext } from './context'

// ============================================================================
// OPERATIONS
// ============================================================================

export {
	create,
	batchCreate,
	readOne,
	readMany,
	batchRead,
	update,
	batchUpdate,
	destroy,
	batchDestroy
} from './operations'
