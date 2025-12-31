'use client'

import { useCallback, useRef } from 'react'
import { getNote as getNoteQuery } from '../api/queries/get-note'
import type { Note } from '../types'
import { invalidateForStorageKey } from '@skriuw/crud'
import { STORAGE_KEYS } from '@/lib/storage-keys'

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
	 * Prefetch a note in the background
	 * Call this on mouse enter of note items in sidebar
	 */
	const prefetchNote = useCallback((noteId: string) => {
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
			.catch(() => {
				// Ignore errors in prefetch
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
	 * Invalidate a note's cache
	 */
	const invalidateNote = useCallback((noteId: string) => {
		invalidateForStorageKey(STORAGE_KEYS.NOTES)
	}, [])

	return {
		prefetchNote,
		prefetchNoteDebounced,
		cancelPrefetch,
		invalidateNote
	}
}
