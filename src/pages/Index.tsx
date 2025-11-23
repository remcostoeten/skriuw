import { Suspense, lazy } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { EmptyState } from '@/shared/ui/empty-state'

import { useNotesWithSuspense } from '@/features/notes/hooks/useNotesWithSuspense'
import { useShortcut, shortcut } from '@/features/shortcuts'

import { AppLayoutContainer } from '@/components/layout/app-layout-container'

import { IndexSkeleton } from './components/index-skeleton'

// Lazy load the editor for better performance
const NoteEditor = lazy(() =>
    import('@/features/editor/components/NoteEditor').then((mod) => ({
        default: mod.NoteEditor
    }))
)

export default function Index() {
    const location = useLocation()
    const navigate = useNavigate()
    const { createNote, isInitialLoading } = useNotesWithSuspense()

    const isNoteRoute = location.pathname.startsWith('/note/')
    const noteId = isNoteRoute ? location.pathname.split('/note/')[1] : null

    async function handleCreateNote() {
        const newNote = await createNote('Untitled')
        if (newNote) {
            navigate(`/note/${newNote.id}?focus=true`)
            toast.success('Note created')
        }
    }

    async function handleOpenCollection() {
        // TODO: Implement open collection functionality
        toast.warning('Not implemented yet')
    }

    useShortcut('create-note', (e) => {
        e.preventDefault()
        handleCreateNote()
    })

    useShortcut('open-collection', (e) => {
        e.preventDefault()
        handleOpenCollection()
    })

    if (!noteId) {
        return (
            <AppLayoutContainer>
                <div className="flex-1 flex items-center justify-center bg-background h-full">
                    {isInitialLoading ? (
                        <IndexSkeleton />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto px-6">
                            <EmptyState
                                message="Select a note to start editing"
                                submessage="Get started by opening a collection or creating a new note"
                                actions={[
                                    {
                                        label: 'Open Collection',
                                        shortcut: shortcut()
                                            .modifiers('Cmd')
                                            .key('O'),
                                        separator: true,
                                        onClick: handleOpenCollection
                                    },
                                    {
                                        label: 'Create Note',
                                        shortcut: shortcut()
                                            .modifiers('Cmd')
                                            .key('N'),
                                        separator: true,
                                        onClick: handleCreateNote
                                    }
                                ]}
                            />
                        </div>
                    )}
                </div>
            </AppLayoutContainer>
        )
    }

    // Show note editor when a note is selected
    return (
        <AppLayoutContainer sidebarActiveNoteId={noteId}>
            <Suspense
                fallback={
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-muted-foreground">
                            Loading editor...
                        </div>
                    </div>
                }
            >
                <NoteEditor noteId={noteId} className="overflow-y-auto" />
            </Suspense>
        </AppLayoutContainer>
    )
}
