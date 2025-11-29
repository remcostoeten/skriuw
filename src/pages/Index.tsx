import { Suspense, lazy, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { EmptyState } from '@/shared/ui/empty-state'

import { useNotesWithSuspense } from '@/features/notes/hooks/useNotesWithSuspense'
import { useShortcut, shortcut } from '@/features/shortcuts'
import { SeedImportDialog } from '@/features/seed-importer/components/seed-import-dialog'
import { useSeedDiscovery } from '@/features/seed-importer/hooks/use-seed-discovery'

import { AppLayoutContainer } from '@/components/layout/app-layout-container'

import { IndexSkeleton } from './components/index-skeleton'

 const NoteEditor = lazy(() =>
    import('@/features/editor/components/note-editor').then((mod) => ({
        default: mod.NoteEditor
    }))
)

export default function Index() {
    const location = useLocation()
    const navigate = useNavigate()
    const { createNote, isInitialLoading } = useNotesWithSuspense()
    const [showSeedImport, setShowSeedImport] = useState(false)
    const { seeds } = useSeedDiscovery()

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
        setShowSeedImport(true)
    }

    function handleSeedImportComplete() {
        setShowSeedImport(false)
        toast.success('Collection imported successfully')
    }

    useShortcut('create-note', (e) => {
        e.preventDefault()
        handleCreateNote()
    })

    useShortcut('open-collection', (e) => {
        e.preventDefault()
        handleOpenCollection()
    })

    return (
        <>
            {!noteId ? (
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
            ) : (
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
            )}
            <SeedImportDialog
                open={showSeedImport}
                onOpenChange={setShowSeedImport}
                seeds={seeds}
                onImport={handleSeedImportComplete}
            />
        </>
    )
}
