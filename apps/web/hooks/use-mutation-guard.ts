'use client'

import { useSession } from '@/lib/auth-client'
import { useState, useCallback } from 'react'
import { toast } from 'sonner'

type MutationGuardOptions = {
    /** Custom message shown when action is blocked */
    message?: string
    /** Whether to automatically trigger the auth modal */
    triggerModal?: boolean
}

type MutationGuardResult = {
    /** Whether the user is authenticated */
    isAuthenticated: boolean
    /** Whether we're still loading auth state */
    isLoading: boolean
    /** 
     * Wraps an action to check auth before executing.
     * If unauthenticated, shows toast and optionally triggers auth modal.
     * Returns true if action was executed, false if blocked.
     */
    guard: <T>(action: () => T | Promise<T>, options?: MutationGuardOptions) => Promise<T | null>
    /** 
     * Dispatches the auth-required event to trigger the auth modal.
     */
    requestAuth: (message?: string) => void
}

/**
 * Hook for guarding mutations that require authentication.
 * 
 * @example
 * ```tsx
 * const { guard } = useMutationGuard()
 * 
 * const handleDelete = () => guard(async () => {
 *   await deleteNote(noteId)
 * })
 * ```
 */
export function useMutationGuard(): MutationGuardResult {
    const { data: session, isPending } = useSession()
    const [, setTriggerCount] = useState(0)

    const isAuthenticated = Boolean(session?.user?.id)

    const requestAuth = useCallback((message?: string) => {
        // Dispatch custom event that AuthModal can listen to
        const event = new CustomEvent('skriuw:auth-required', {
            detail: {
                status: 401,
                message: message || 'You need an account to perform this action',
                action: 'mutation_blocked'
            }
        })
        window.dispatchEvent(event)
        // Force re-render to potentially show modal
        setTriggerCount(c => c + 1)
    }, [])

    const guard = useCallback(async <T,>(
        action: () => T | Promise<T>,
        options: MutationGuardOptions = {}
    ): Promise<T | null> => {
        const {
            message = 'You need an account to perform this action',
            triggerModal = true
        } = options

        if (isPending) {
            // Still loading, wait a bit and retry
            return null
        }

        if (!isAuthenticated) {
            toast.info('Login required', {
                description: message,
                action: triggerModal ? {
                    label: 'Sign in',
                    onClick: () => requestAuth(message)
                } : undefined,
            })

            if (triggerModal) {
                requestAuth(message)
            }

            return null
        }

        // User is authenticated, execute the action
        try {
            return await action()
        } catch (error) {
            console.error('Guarded action failed:', error)
            throw error
        }
    }, [isAuthenticated, isPending, requestAuth])

    return {
        isAuthenticated,
        isLoading: isPending,
        guard,
        requestAuth,
    }
}

/**
 * Simple check if user is authenticated. 
 * For use in components that just need to know auth state.
 */
export function useIsAuthenticated(): { isAuthenticated: boolean; isLoading: boolean } {
    const { data: session, isPending } = useSession()
    return {
        isAuthenticated: Boolean(session?.user?.id),
        isLoading: isPending,
    }
}
