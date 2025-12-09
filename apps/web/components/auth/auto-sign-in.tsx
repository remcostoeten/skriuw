'use client'

import { useEffect } from 'react'
import { signIn, useSession } from '@/lib/auth-client'

export function AutoSignIn() {
    const { data: session, isPending, error } = useSession()

    useEffect(() => {
        // If we're done loading and there's no session, sign in anonymously
        if (!isPending && !session && !error) {
            signIn.anonymous().catch((err) => {
                console.error('Failed to sign in anonymously:', err)
            })
        }
    }, [session, isPending, error])

    return null
}
