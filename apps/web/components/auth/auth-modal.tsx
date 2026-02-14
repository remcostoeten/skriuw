'use client'

import { useAuthModal } from './auth-modal-context'
import { AuthOverlay } from './auth-overlay'

export function AuthModal() {
	const { showAuthModal, setShowAuthModal, requireAuth } = useAuthModal()

	return (
		<AuthOverlay
			isOpen={showAuthModal}
			onClose={() => setShowAuthModal(false)}
			onSuccess={() => setShowAuthModal(false)}
			allowClose={!requireAuth}
		/>
	)
}

