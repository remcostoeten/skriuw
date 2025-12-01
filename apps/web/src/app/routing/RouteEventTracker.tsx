import { useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

import { useSelectionStore } from '@/stores/selection-store'

export function RouteEventTracker() {
    const location = useLocation()
    const previousPathRef = useRef<string | null>(null)
    const clearSelection = useSelectionStore((state) => state.clearSelection)

    // Track route changes and clear selection when route changes
    const path = `${location.pathname}${location.search}${location.hash}`
    
    useEffect(() => {
        if (previousPathRef.current !== null && previousPathRef.current !== path) {
            // Route changed - clear any selected items
            clearSelection()
        }
        previousPathRef.current = path
    }, [path, clearSelection])

    return null
}
