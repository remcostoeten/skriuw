'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { AuthModal } from './auth-modal'

type AuthModalContextType = {
    isOpen: boolean
    open: () => void
    close: () => void
}

const AuthModalContext = createContext<AuthModalContextType | null>(null)

export function useAuthModal() {
    const context = useContext(AuthModalContext)
    if (!context) {
        throw new Error('useAuthModal must be used within AuthModalProvider')
    }
    return context
}

/**
 * Provider that manages the global auth modal state.
 * Listens for 'skriuw:auth-required' events and opens the modal.
 */
export function AuthModalProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false)

    const open = useCallback(() => setIsOpen(true), [])
    const close = useCallback(() => setIsOpen(false), [])

    // Listen for auth-required events to auto-open modal
    useEffect(() => {
        function handleAuthRequired(event: Event) {
            const detail = (event as CustomEvent<{ status: number; action?: string }>).detail
            // Only auto-open for mutation blocks (not 503 service disabled)
            if (detail?.status === 401) {
                setIsOpen(true)
            }
        }

        window.addEventListener('skriuw:auth-required', handleAuthRequired as EventListener)
        return () => window.removeEventListener('skriuw:auth-required', handleAuthRequired as EventListener)
    }, [])

    return (
        <AuthModalContext.Provider value={{ isOpen, open, close }}>
            {children}
            <AuthModal open={isOpen} onOpenChange={setIsOpen} />
        </AuthModalContext.Provider>
    )
}
