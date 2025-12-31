'use client'

import { useMemo, use } from 'react'

import { NoteSplitView } from '@/features/notes/components/note-split-view'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'

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

	// While loading, show nothing (NoteSplitView handles its own loading)
	// The sidebar is always visible so user has context
	if (isInitialLoading) {
		return null
	}

	// Note not found after loading complete
	if (!noteId && !isInitialLoading) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
				<div className="text-destructive/80 font-medium">Note not found</div>
				<p className="text-muted-foreground text-sm text-center max-w-sm">
					This note doesn't exist or has been deleted. Select another note from the sidebar.
				</p>
			</div>
		)
	}

	return noteId ? <NoteSplitView noteId={noteId} /> : null
}
