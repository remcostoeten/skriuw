'use client'

import { useEffect, useRef } from 'react'
import { AUTH_CLIENT_ENABLED, useSession } from '@/lib/auth-client'
import { logger } from '@/lib/logger'

const ZERO_SESSION_COOKIE = 'skriuw_zero_session'
const ZERO_SESSION_STORAGE_KEY = 'skriuw_zero_session_id'
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

function getStoredZeroSessionId(): string | null {
        if (typeof window === 'undefined') return null

        const cookieMatch = document.cookie
                .split('; ')
                .find((row) => row.startsWith(`${ZERO_SESSION_COOKIE}=`))

        const cookieValue = cookieMatch?.split('=')[1]
        if (cookieValue) return cookieValue

        try {
                return localStorage.getItem(ZERO_SESSION_STORAGE_KEY)
        } catch (err) {
                logger.error('auth', 'Failed to read zero session from storage', err)
                return null
        }
}

function persistZeroSessionId(id: string) {
        if (typeof window === 'undefined') return

        document.cookie = `${ZERO_SESSION_COOKIE}=${id}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; SameSite=Lax`

        try {
                localStorage.setItem(ZERO_SESSION_STORAGE_KEY, id)
        } catch (err) {
                logger.error('auth', 'Failed to persist zero session', err)
        }
}

function generateZeroSessionId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID()
        }

        return `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function ensureZeroSession(): string | null {
        const existingId = getStoredZeroSessionId()
        if (existingId) return existingId

        const zeroSessionId = generateZeroSessionId()
        persistZeroSessionId(zeroSessionId)
        return zeroSessionId
}

export function AutoSignIn() {
        const { data: session, isPending, error } = useSession()
        const hasTrackedVisitor = useRef(false)

        useEffect(() => {
                if (!AUTH_CLIENT_ENABLED) {
			logger.info(
				'auth',
                                'Auth client disabled (missing NEXT_PUBLIC_APP_URL)'
                        )
                }

                logger.info('auth', 'State:', {
                        session: !!session,
                        isPending,
                        error: !!error
                })

                if (typeof window === 'undefined') return

                if (hasTrackedVisitor.current) return

                const zeroSessionId = ensureZeroSession()

                if (zeroSessionId) {
                        logger.info('auth', 'Zero session ready', {
                                zeroSessionId,
                                sessionPresent: !!session
                        })
                }

                hasTrackedVisitor.current = true
        }, [session, isPending, error])

        return null
}
