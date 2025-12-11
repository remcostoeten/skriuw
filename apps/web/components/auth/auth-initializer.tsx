'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useSession } from '../../lib/auth-client'
import {
    initializeStorage,
    migrateDemoDataToDb,
    shouldMigrateDemoData,
    getStorageMode
} from '../../lib/storage/hybrid-storage'

type AuthInitializerProps = {
    children: ReactNode
}

/**
 * Manages authentication state and storage mode.
 * 
 * Flow:
 * 1. User visits → uses localStorage (demo mode), no 401 errors
 * 2. User clicks "Anonymous Login" → creates session
 * 3. Demo data migrates to DB automatically
 * 4. Storage switches to API mode
 */
export function AuthInitializer({ children }: AuthInitializerProps) {
    const { data: session, isPending } = useSession()
    const [isReady, setIsReady] = useState(false)

    useEffect(() => {
        async function initialize() {
            // Wait for session check to complete
            if (isPending) return

            const isAuthenticated = !!session

            // Initialize storage based on auth status
            initializeStorage(isAuthenticated)

            // If just authenticated and has demo data, migrate it
            if (isAuthenticated && shouldMigrateDemoData()) {
                await migrateDemoDataToDb()
            }

            setIsReady(true)
        }

        initialize()
    }, [session, isPending])

    // Show nothing while initializing
    if (!isReady) {
        return null
    }

    return <>{children}</>
}
