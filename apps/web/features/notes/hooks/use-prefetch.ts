import { useCallback, useRef } from 'react'
import { getNote as getNoteQuery } from '../api/queries/get-note'
import type { Note } from '../types'

// In-memory cache for prefetched notes
const noteCache = new Map<string, { data: Note; timestamp: number }>()
const CACHE_TTL_MS = 30000 // 30 seconds

// Track in-flight prefetch requests to avoid duplicates
const inflightPrefetches = new Set<string>()

/**
 * Prefetch hook for notes - preloads note content on hover
 * to make opening notes feel instant
 */
export function usePrefetch() {
    // Debounce timer ref
    const debounceRef = useRef<NodeJS.Timeout | null>(null)

    /**
     * Get a note from cache if available and not stale
     */
    const getCachedNote = useCallback((noteId: string): Note | null => {
        const cached = noteCache.get(noteId)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return cached.data
        }
        return null
    }, [])

    /**
     * Prefetch a note in the background
     * Call this on mouse enter of note items in sidebar
     */
    const prefetchNote = useCallback((noteId: string) => {
        // Skip if already cached and fresh
        const cached = noteCache.get(noteId)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return
        }

        // Skip if already fetching
        if (inflightPrefetches.has(noteId)) {
            return
        }

        // Skip temp IDs (optimistic items)
        if (noteId.startsWith('temp-')) {
            return
        }

        // Mark as in-flight
        inflightPrefetches.add(noteId)

        // Prefetch in background (fire and forget)
        getNoteQuery(noteId)
            .then((note) => {
                if (note) {
                    noteCache.set(noteId, { data: note, timestamp: Date.now() })
                }
            })
            .catch(() => {
                // Silently fail - prefetch is best-effort
            })
            .finally(() => {
                inflightPrefetches.delete(noteId)
            })
    }, [])

    /**
     * Debounced prefetch - use this for hover events
     * to avoid prefetching when user is just moving mouse across
     */
    const prefetchNoteDebounced = useCallback(
        (noteId: string, delay: number = 150) => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current)
            }
            debounceRef.current = setTimeout(() => {
                prefetchNote(noteId)
            }, delay)
        },
        [prefetchNote]
    )

    /**
     * Cancel pending prefetch (call on mouse leave)
     */
    const cancelPrefetch = useCallback(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current)
            debounceRef.current = null
        }
    }, [])

    /**
     * Invalidate a cached note (call after update)
     */
    const invalidateNote = useCallback((noteId: string) => {
        noteCache.delete(noteId)
    }, [])

    /**
     * Clear entire prefetch cache
     */
    const clearCache = useCallback(() => {
        noteCache.clear()
    }, [])

    return {
        prefetchNote,
        prefetchNoteDebounced,
        cancelPrefetch,
        getCachedNote,
        invalidateNote,
        clearCache,
    }
}

/**
 * Export cache for use in getNote query
 */
export function getPrefetchedNote(noteId: string): Note | null {
    const cached = noteCache.get(noteId)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data
    }
    return null
}

/**
 * Invalidate a prefetched note (call from mutations after update/delete)
 */
export function invalidatePrefetchedNote(noteId: string): void {
    noteCache.delete(noteId)
}
