'use client'

import { useEffect } from 'react'
import { signIn, useSession } from '@/lib/auth-client'

// Development flags for debugging
const DEV_FLAGS = {
    // Set to true to disable auto-sign-in (useful for debugging)
    DISABLE_AUTO_SIGNIN: process.env.NEXT_PUBLIC_DISABLE_AUTO_SIGNIN === 'true',
    // Set to true to enable detailed logging
    ENABLE_AUTH_LOGGING: process.env.NEXT_PUBLIC_ENABLE_AUTH_LOGGING === 'true',
}

function log(...args: any[]) {
    if (DEV_FLAGS.ENABLE_AUTH_LOGGING) {
        console.log('[AutoSignIn]', ...args)
    }
}

export function AutoSignIn() {
    const { data: session, isPending, error } = useSession()

    useEffect(() => {
        log('State:', { session: !!session, isPending, error: !!error })

        // Check if auto-sign-in is disabled for development
        if (DEV_FLAGS.DISABLE_AUTO_SIGNIN) {
            log('Auto-sign-in disabled via DEV_FLAGS.DISABLE_AUTO_SIGNIN')
            return
        }

        // If we're done loading and there's no session, sign in anonymously
        if (!isPending && !session && !error) {
            log('Attempting anonymous sign-in...')
            signIn.anonymous().catch((err) => {
                console.error('Failed to sign in anonymously:', err)
            })
        }
    }, [session, isPending, error])

    return null
}
