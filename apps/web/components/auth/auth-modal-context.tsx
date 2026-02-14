'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

type OpenAuthModalOptions = {
	requireAuth?: boolean
}

type AuthModalContextValue = {
	showAuthModal: boolean
	setShowAuthModal: (show: boolean) => void
	requireAuth: boolean
	setRequireAuth: (requireAuth: boolean) => void
	openAuthModal: (options?: OpenAuthModalOptions) => void
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null)

export function AuthModalProvider({ children }: { children: ReactNode }) {
	const [showAuthModal, setShowAuthModal] = useState(false)
	const [requireAuth, setRequireAuth] = useState(false)
	const pathname = usePathname()
	const router = useRouter()
	const searchParams = useSearchParams()

	const openAuthModal = useCallback((options?: OpenAuthModalOptions) => {
		setRequireAuth(Boolean(options?.requireAuth))
		setShowAuthModal(true)
	}, [])

	const value = useMemo<AuthModalContextValue>(
		() => ({
			showAuthModal,
			setShowAuthModal,
			requireAuth,
			setRequireAuth,
			openAuthModal
		}),
		[showAuthModal, requireAuth, openAuthModal]
	)

	useEffect(() => {
		const shouldOpen = searchParams.get('auth') === '1'
		if (!shouldOpen) return

		openAuthModal()

		const next = new URLSearchParams(searchParams.toString())
		next.delete('auth')
		const qs = next.toString()
		router.replace(qs ? `${pathname}?${qs}` : pathname)
	}, [searchParams, pathname, router, openAuthModal])

	return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>
}

export function useAuthModal() {
	const ctx = useContext(AuthModalContext)
	if (!ctx) {
		throw new Error('useAuthModal must be used within AuthModalProvider')
	}
	return ctx
}
