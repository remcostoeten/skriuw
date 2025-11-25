import { useParams } from 'react-router-dom'

import { NoteEditor as NoteEditorComponent } from '@/features/editor/components/NoteEditor'

import { AppLayoutContainer } from '@/components/layout/app-layout-container'

export default function NoteEditor() {
    const { id } = useParams()
    return (
        <AppLayoutContainer sidebarActiveNoteId={id}>
            <NoteEditorComponent key={id} noteId={id} />
        </AppLayoutContainer>
    )
}
