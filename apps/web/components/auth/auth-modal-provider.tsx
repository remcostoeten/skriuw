'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { AuthModal } from './auth-modal'
import { IDENTITY_REQUIRED_EVENT } from '@/lib/identity-guard'

type AuthModalContextType = {
    isOpen: boolean
    open: () => void
    close: () => void
    lastAction?: string
}

const AuthModalContext = createContext<AuthModalContextType | null>(null)

export function useAuthModal() {
    const context = useContext(AuthModalContext)
    if (!context) {
        throw new Error('useAuthModal must be used within AuthModalProvider')
    }
    return context
}

type AuthModalProviderProps = {
    children: ReactNode
    /** When true, the auth modal will never open */
    disabled?: boolean
}

/**
 * Provider that manages the global auth modal state.
 * Listens for 'skriuw:auth-required' events and opens the modal.
 */
export function AuthModalProvider({ children, disabled = false }: AuthModalProviderProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [lastAction, setLastAction] = useState<string>()

    const open = useCallback(() => {
        if (!disabled) {
            setIsOpen(true)
        }
    }, [disabled])
    const close = useCallback(() => {
        setIsOpen(false)
        setLastAction(undefined)
    }, [])

    // Listen for identity-required events to auto-open modal
    useEffect(() => {
        if (disabled) return

        function handleIdentityRequired(event: Event) {
            const detail = (event as CustomEvent<{ status: number; action?: string }>).detail

            // Only auto-open for authentication blocks (not 503 service disabled)
            if (detail?.status === 401) {
                setLastAction(detail.action)
                setIsOpen(true)
            }
        }

        // Listen for the new identity-required event
        window.addEventListener(IDENTITY_REQUIRED_EVENT, handleIdentityRequired as EventListener)

        // Keep backward compatibility with the old auth-required event
        window.addEventListener('skriuw:auth-required', handleIdentityRequired as EventListener)

        return () => {
            window.removeEventListener(IDENTITY_REQUIRED_EVENT, handleIdentityRequired as EventListener)
            window.removeEventListener('skriuw:auth-required', handleIdentityRequired as EventListener)
        }
    }, [disabled])

    return (
        <AuthModalContext.Provider value={{ isOpen, open, close, lastAction }}>
            {children}
            {!disabled && (
                <AuthModal
                    open={isOpen}
                    onOpenChange={setIsOpen}
                    action={lastAction}
                />
            )}
        </AuthModalContext.Provider>
    )
}
