import { Suspense, lazy, useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { EmptyState } from '@/shared/ui/empty-state'

import { useNotesWithSuspense } from '@/features/notes/hooks/useNotesWithSuspense'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
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
    const { items, createNote, isInitialLoading } = useNotesWithSuspense()
    const [showSeedImport, setShowSeedImport] = useState(false)
    const { seeds } = useSeedDiscovery()
    const { resolveNoteId, getNoteUrl } = useNoteSlug(items)

    const isNoteRoute = location.pathname.startsWith('/note/')
    const slugOrId = isNoteRoute ? location.pathname.split('/note/')[1]?.split('?')[0] : null
    const noteId = useMemo(() => {
        if (!slugOrId) return null
        return resolveNoteId(slugOrId)
    }, [slugOrId, resolveNoteId])

    async function handleCreateNote() {
        const newNote = await createNote('Untitled')
        if (newNote) {
            const url = getNoteUrl(newNote.id)
            navigate(`${url}?focus=true`)
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
                            <div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-6 py-12">
                                <div className="flex flex-col items-center gap-6 mb-8">
                                    <div className="flex flex-col items-center gap-3">
                                        <h1 className="text-4xl font-bold text-foreground" style={{ fontFamily: 'Georgia, "Playfair Display", "Times New Roman", serif' }}>Skriuw</h1>
                                        <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                            <p className="text-sm italic">
                                                <span className="font-mono">/skrɪu̯/</span> — <span className="font-medium">Frisian, "to write."</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="max-w-lg text-center">
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            A local-first desktop application for writing and organizing thoughts. Built with Tauri 2.0 and React, <strong className="text-foreground">Skriuw</strong> blends note-taking and task management into a fast, private workspace with Markdown editing and offline access.
                                        </p>
                                    </div>
                                </div>
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
