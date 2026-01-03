'use client'

import { useMemo, use, useRef, useState, useEffect } from 'react'

import { NoteSplitView } from '@/features/notes/components/note-split-view'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { cn } from '@skriuw/shared'

/**
 * Minimal skeleton that matches the editor area
 */
function NoteEditorSkeleton() {
	return (
		<div className="flex-1 flex flex-col p-8 animate-pulse">
			<div className="h-8 w-48 bg-muted/50 rounded mb-6" />
			<div className="space-y-3">
				<div className="h-4 w-full bg-muted/30 rounded" />
				<div className="h-4 w-5/6 bg-muted/30 rounded" />
				<div className="h-4 w-4/6 bg-muted/30 rounded" />
			</div>
		</div>
	)
}

/**
 * Note editor page - renders the split view with sidebar and editor.
 */
export default function NoteEditorPage({ params }: { params: Promise<{ slug: string[] }> }) {
	const resolvedParams = use(params)
	const slugOrId = resolvedParams.slug?.join('/') || null
	const { items, isInitialLoading } = useNotesContext()
	const { resolveNoteId } = useNoteSlug(items)

	const noteId = useMemo(() => {
		if (!slugOrId) return null
		return resolveNoteId(slugOrId)
	}, [slugOrId, resolveNoteId])

	// State for delayed "not found" display
	const [showNotFound, setShowNotFound] = useState(false)
	const timerRef = useRef<NodeJS.Timeout | null>(null)

	useEffect(() => {
		// Clear any pending timer when noteId changes
		if (timerRef.current) {
			clearTimeout(timerRef.current)
			timerRef.current = null
		}

		if (noteId) {
			// We have a valid note - reset everything
			setShowNotFound(false)
		} else if (!isInitialLoading && slugOrId) {
			// No noteId but we have a slug - wait before showing "not found"
			// This handles race conditions during navigation
			timerRef.current = setTimeout(() => {
				setShowNotFound(true)
			}, 200)
		}

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current)
			}
		}
	}, [noteId, isInitialLoading, slugOrId])

	// Initial app loading - show nothing (sidebar skeleton handles this)
	if (isInitialLoading) {
		return null
	}

	// We have a valid note - render it immediately
	if (noteId) {
		return <NoteSplitView noteId={noteId} />
	}

	// Waiting for note resolution - show subtle skeleton
	// (This only appears during the brief transition window)
	if (!showNotFound && slugOrId) {
		return <NoteEditorSkeleton />
	}

	// Note genuinely not found after delay
	if (showNotFound) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
				<div className="text-destructive/80 font-medium">Note not found</div>
				<p className="text-muted-foreground text-sm text-center max-w-sm">
					This note doesn't exist or has been deleted. Select another note from the sidebar.
				</p>
			</div>
		)
	}

	return null
}

