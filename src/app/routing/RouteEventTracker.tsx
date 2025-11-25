import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

import { logStorageEvent } from '@/features/storage-status/utils/storage-event-log'

export function RouteEventTracker() {
    const location = useLocation()
    const previousPathRef = useRef<string | null>(null)

    useEffect(() => {
        const path = `${location.pathname}${location.search}${location.hash}`

        if (previousPathRef.current === path && previousPathRef.current !== null) {
            return
        }

        logStorageEvent({
            storageKey: '__router__',
            eventType: 'route',
            source: 'router',
            description: `Navigated to ${path || '/'}`
        })

        previousPathRef.current = path
    }, [location])

    return null
}
