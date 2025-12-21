'use client'

import { useSession } from '@/lib/auth-client'
import { useCallback, useRef } from 'react'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Identity state for the current user
 */
export interface IdentityState {
  /** Whether user has any session (authenticated or anonymous) */
  hasIdentity: boolean
  /** Whether user is fully authenticated (not anonymous) */
  isAuthenticated: boolean
  /** Whether user is anonymous */
  isAnonymous: boolean
  /** User ID if available */
  userId?: string
}

/**
 * Result of an identity-protected operation
 */
export interface IdentityGuardResult<T = void> {
  success: boolean
  data?: T
  error?: string
  requiresAuth?: boolean
}

// ============================================================================
// EVENTS
// ============================================================================

/**
 * Event dispatched when authentication is required
 */
export const IDENTITY_REQUIRED_EVENT = 'skriuw:identity-required'

/**
 * Dispatch event to trigger auth modal
 */
export function dispatchIdentityRequired(options?: { action?: string }) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent(IDENTITY_REQUIRED_EVENT, {
    detail: { status: 401, action: options?.action }
  }))
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to get current identity state
 */
export function useIdentityState(): IdentityState {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return {
      hasIdentity: false,
      isAuthenticated: false,
      isAnonymous: false
    }
  }

  const hasSession = !!session?.user
  const isAnonymous = session?.user?.isAnonymous ?? false
  const isAuthenticated = hasSession && !isAnonymous

  return {
    hasIdentity: hasSession,
    isAuthenticated,
    isAnonymous,
    userId: session?.user?.id
  }
}

// ============================================================================
// CLIENT WRAPPER
// ============================================================================

/**
 * Options for withIdentity wrapper
 */
export interface WithIdentityOptions {
  /** Custom action name for error tracking */
  action?: string
  /** Custom error message */
  errorMessage?: string
  /** Whether to show the auth modal automatically */
  showModal?: boolean
}

/**
 * Wraps an async function with identity protection
 * Automatically shows auth modal if no identity exists
 */
export function withIdentity<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: WithIdentityOptions = {}
): T {
  return (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    const { action, errorMessage = 'Authentication required', showModal = true } = options

    try {
      // Check if user has identity (session exists)
      const response = await fetch('/api/auth/check', {
        method: 'GET',
        credentials: 'include'
      })

      if (!response.ok) {
        // No session - trigger auth modal
        if (showModal) {
          dispatchIdentityRequired({ action })
        }
        throw new Error(errorMessage)
      }

      const { hasIdentity } = await response.json()

      if (!hasIdentity) {
        // No identity - trigger auth modal
        if (showModal) {
          dispatchIdentityRequired({ action })
        }
        throw new Error(errorMessage)
      }

      // User has identity - proceed with function
      return await fn(...args)
    } catch (error) {
      // Re-throw our error or the original error
      if (error instanceof Error && error.message === errorMessage) {
        throw error
      }
      // For other errors, don't show modal (they might be legitimate errors)
      throw error
    }
  }) as T
}

/**
 * Typed version of withIdentity that preserves function signatures
 */
export type WithIdentityFn<T extends (...args: any[]) => Promise<any>> = (
  ...args: Parameters<T>
) => Promise<Awaited<ReturnType<T>>>

/**
 * Creates a typed identity guard wrapper
 */
export function createIdentityGuard<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options?: WithIdentityOptions
): WithIdentityFn<T> {
  return withIdentity(fn, options)
}

// ============================================================================
// REACT HOOK WRAPPER
// ============================================================================

/**
 * React hook that wraps server actions with identity protection
 * Uses session state for instant checks without network requests
 */
export function useWithIdentity() {
  const identity = useIdentityState()

  return useCallback(<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    options: WithIdentityOptions = {}
  ): ((...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>) => {
    return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
      const { action, errorMessage = 'Authentication required', showModal = true } = options

      // Check local session state first
      if (!identity.hasIdentity) {
        if (showModal) {
          dispatchIdentityRequired({ action })
        }
        throw new Error(errorMessage)
      }

      try {
        // Proceed with the function
        return await fn(...args)
      } catch (error) {
        // If error indicates no session, trigger modal
        if (error instanceof Error &&
            (error.message.includes('Authentication required') ||
             error.message.includes('Session not found'))) {
          if (showModal) {
            dispatchIdentityRequired({ action })
          }
        }
        throw error
      }
    }
  }, [identity.hasIdentity])
}

// ============================================================================
// SERVER ACTION WRAPPER
// ============================================================================

// Note: Server-side identity protection is handled in the server-action wrapper
// This client file should not import server-only code
// Use withServerIdentity from server-actions.ts for server-side validation

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Higher-order function to wrap multiple CRUD operations
 */
export function createCrudGuard<T extends Record<string, (...args: any[]) => Promise<any>>>(
  operations: T,
  defaultOptions: WithIdentityOptions = {}
): T {
  const wrapped = {} as T

  for (const [key, fn] of Object.entries(operations)) {
    wrapped[key as keyof T] = withIdentity(fn, {
      action: key,
      ...defaultOptions
    }) as T[keyof T]
  }

  return wrapped
}

/**
 * Check if an error is an identity-related error
 */
export function isIdentityError(error: unknown): boolean {
  return error instanceof Error &&
         (error.message.includes('Authentication required') ||
          error.message.includes('Session not found') ||
          error.message.includes('Unauthorized'))
}

// ============================================================================
// EXAMPLE USAGE (for documentation)
// ============================================================================

/**
 * Example server actions that should be protected
 */
export const EXAMPLE_SERVER_ACTIONS = `// app/actions/notes.ts
'use server'

import { withServerIdentity } from '@/lib/identity-guard'
import { db } from '@skriuw/db'

export async function createNote(data: { name: string; content: string }) {
  return withServerIdentity(async () => {
    // Your existing createNote logic here
    const result = await db.insert(notes).values({
      id: generateId(),
      ...data,
      userId: session.user.id // Will be available due to identity check
    })
    return result
  })
}

export async function updateNote(id: string, data: Partial<Note>) {
  return withServerIdentity(async () => {
    // Your existing updateNote logic here
    const result = await db
      .update(notes)
      .set({ ...data, updatedAt: Date.now() })
      .where(eq(notes.id, id) && eq(notes.userId, session.user.id))
    return result
  })
}
` as const

/**
 * Example client-side usage in components
 */
export const EXAMPLE_CLIENT_USAGE = `// components/note-editor.tsx
'use client'

import { useWithIdentity, createCrudGuard } from '@/lib/identity-guard'
import { createNote, updateNote, deleteNote } from '@/app/actions/notes'

export function NoteEditor() {
  const withIdentity = useWithIdentity()

  // Option 1: Wrap individual actions
  const safeCreateNote = withIdentity(createNote, { action: 'create-note' })
  const safeUpdateNote = withIdentity(updateNote, { action: 'update-note' })
  const safeDeleteNote = withIdentity(deleteNote, { action: 'delete-note' })

  // Option 2: Wrap all CRUD operations at once
  const notesApi = createCrudGuard({
    create: createNote,
    update: updateNote,
    delete: deleteNote
  }, { showModal: true })

  const handleCreate = async () => {
    try {
      await safeCreateNote({ name: 'New Note', content: 'Hello world' })
      // Success!
    } catch (error) {
      if (isIdentityError(error)) {
        // Auth modal will be showing automatically
        console.log('Please sign in to create notes')
      } else {
        // Handle other errors
        console.error('Failed to create note:', error)
      }
    }
  }

  return (
    <div>
      <button onClick={handleCreate}>Create Note</button>
    </div>
  )
}
` as const