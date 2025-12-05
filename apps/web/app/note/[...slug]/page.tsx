'use client'

import { useMemo, use } from 'react'

import { NoteEditor as NoteEditorComponent } from '../../../features/editor/components/note-editor'
import { useNotesContext } from '../../../features/notes/context/notes-context'
import { useNoteSlug } from '../../../features/notes/hooks/use-note-slug'

export default function NoteEditorPage({ params }: { params: Promise<{ slug: string[] }> }) {
	const resolvedParams = use(params)
	const slugOrId = resolvedParams.slug?.join('/') || null
	const { items } = useNotesContext()
	const { resolveNoteId } = useNoteSlug(items)

	const noteId = useMemo(() => {
		if (!slugOrId) return null
		return resolveNoteId(slugOrId)
	}, [slugOrId, resolveNoteId])

	return <>{noteId && <NoteEditorComponent key={noteId} noteId={noteId} />}</>
}
