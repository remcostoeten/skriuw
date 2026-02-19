'use client'

import { create } from 'zustand'

type AuthModalState = {
	showAuthModal: boolean
	requireAuth: boolean
	setShowAuthModal: (show: boolean) => void
	setRequireAuth: (require: boolean) => void
}

export const useAuthStore = create<AuthModalState>()((set) => ({
	showAuthModal: false,
	requireAuth: false,
	setShowAuthModal: (show) => set({ showAuthModal: show }),
	setRequireAuth: (require) => set({ requireAuth: require })
}))
