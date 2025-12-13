'use client'

import { useEffect } from 'react'
import { AUTH_CLIENT_ENABLED, signIn, useSession } from '@/lib/auth-client'
import { logger } from '@/lib/logger'

// Development flags for debugging
const DEV_FLAGS = {
	// Set to true to disable auto-sign-in (useful for debugging)
	DISABLE_AUTO_SIGNIN: process.env.NEXT_PUBLIC_DISABLE_AUTO_SIGNIN === 'true'
}

export function AutoSignIn() {
	const { data: session, isPending, error } = useSession()

	useEffect(() => {
		if (!AUTH_CLIENT_ENABLED) {
			logger.info(
				'auth',
				'Auth client disabled (missing NEXT_PUBLIC_APP_URL)'
			)
			return
		}

		logger.info('auth', 'State:', {
			session: !!session,
			isPending,
			error: !!error
		})

		// Check if auto-sign-in is disabled for development
		if (DEV_FLAGS.DISABLE_AUTO_SIGNIN) {
			logger.info(
				'auth',
				'Auto-sign-in disabled via DEV_FLAGS.DISABLE_AUTO_SIGNIN'
			)
			return
		}

		// If we're done loading and there's no session, sign in anonymously
		if (!isPending && !session && !error) {
			logger.info('auth', 'Attempting anonymous sign-in...')
			signIn.anonymous().catch((err) => {
				logger.error('auth', 'Failed to sign in anonymously:', err)
			})
		}
	}, [session, isPending, error])

	return null
}
