import { useParams } from 'react-router-dom'
import { useMemo } from 'react'

import { NoteEditor as NoteEditorComponent } from '@/features/editor/components/note-editor'
import { useNotesWithSuspense } from '@/features/notes/hooks/useNotesWithSuspense'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'

import { AppLayoutContainer } from '@/components/layout/app-layout-container'

export default function NoteEditor() {
    const { id: slugOrId } = useParams()
    const { items } = useNotesWithSuspense()
    const { resolveNoteId } = useNoteSlug(items)
    
    const noteId = useMemo(() => {
        if (!slugOrId) return null
        return resolveNoteId(slugOrId)
    }, [slugOrId, resolveNoteId])
    
    return (
        <AppLayoutContainer sidebarActiveNoteId={noteId || undefined}>
            {noteId && <NoteEditorComponent key={noteId} noteId={noteId} />}
        </AppLayoutContainer>
    )
}
