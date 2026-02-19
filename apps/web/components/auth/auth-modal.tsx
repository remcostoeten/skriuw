'use client'

import { SignInDrawer } from '@/features/authentication/components/sign-in-drawer'
import { useAuthStore } from '@/stores/auth-store'

export function AuthModal() {
	const { showAuthModal, requireAuth, setShowAuthModal } = useAuthStore()

	return (
		<SignInDrawer
			open={showAuthModal}
			onOpenChange={(open) => setShowAuthModal(open)}
			allowClose={!requireAuth}
		/>
	)
}
