import { ReactNode, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { cn } from '@/shared/utilities'
import { useNotes } from '@/features/notes/hooks/useNotes'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import { ShortcutsSidebar } from '@/features/shortcuts/components'
import { useShortcut } from '@/features/shortcuts/use-shortcut'
import {
    StorageStatusPanel,
    StorageStatusToggle
} from '@/features/storage-status'

import { Footer } from '@/components/layout/footer'
import { TopToolbar } from '@/components/layout/top-toolbar'
import { LeftToolbar } from '@/components/left-toolbar'
import { Sidebar } from '@/components/sidebar'
import { SidebarMenu } from '@/components/sidebar-menu'

import type { SidebarContentType } from '@/components/sidebar/types'

type props = {
    children: ReactNode
    showSidebar?: boolean
    sidebarActiveNoteId?: string
    sidebarContentType?: SidebarContentType
    sidebarCustomContent?: ReactNode
}

export function AppLayout({
    children,
    showSidebar = true,
    sidebarActiveNoteId,
    sidebarContentType,
    sidebarCustomContent
}: props) {
    const navigate = useNavigate()
    const { items } = useNotes()
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true)
    const [isShortcutsSidebarOpen, setIsShortcutsSidebarOpen] = useState(false)
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [isStorageStatusOpen, setIsStorageStatusOpen] = useState(false)

    // Flatten all notes in order
    const notesInOrder = useMemo(() => flattenNotes(items), [items])

    // Find current note index
    const currentNoteIndex = useMemo(() => {
        if (!sidebarActiveNoteId) return -1
        return notesInOrder.findIndex((note) => note.id === sidebarActiveNoteId)
    }, [sidebarActiveNoteId, notesInOrder])

    // Navigation handlers
    const handleNavigatePrevious = useCallback(() => {
        if (currentNoteIndex > 0) {
            const previousNote = notesInOrder[currentNoteIndex - 1]
            navigate(`/note/${previousNote.id}`)
        }
    }, [currentNoteIndex, notesInOrder, navigate])

    const handleNavigateNext = useCallback(() => {
        if (
            currentNoteIndex >= 0 &&
            currentNoteIndex < notesInOrder.length - 1
        ) {
            const nextNote = notesInOrder[currentNoteIndex + 1]
            navigate(`/note/${nextNote.id}`)
        }
    }, [currentNoteIndex, notesInOrder, navigate])

    const canNavigatePrevious = currentNoteIndex > 0
    const canNavigateNext =
        currentNoteIndex >= 0 && currentNoteIndex < notesInOrder.length - 1

    useShortcut('toggle-shortcuts', (e) => {
        e.preventDefault()
        setIsShortcutsSidebarOpen((prev) => !prev)
    })

    useShortcut('toggle-sidebar', (e) => {
        e.preventDefault()
        setIsDesktopSidebarOpen((prev) => !prev)
    })

    useShortcut('open-settings', (e) => {
        e.preventDefault()
        setIsSettingsOpen((prev) => !prev)
    })

    return (
        <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
            <div className="flex flex-1 overflow-hidden relative">
                {isSidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-20 lg:hidden"
                        onClick={() => setIsSidebarOpen(false)}
                    />
                )}

                <div
                    className={`hidden lg:block transition-all duration-200 ${
                        isDesktopSidebarOpen ? 'w-auto' : 'w-0'
                    }`}
                >
                    <LeftToolbar
                        onSettingsClick={() => setIsSettingsOpen(true)}
                    />
                </div>

                {showSidebar && (
                    <div
                        className={`
            fixed lg:static inset-y-0 left-0 z-30 lg:z-0
            transform transition-transform duration-200 ease-in-out
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
                    >
                        <Sidebar
                            activeNoteId={sidebarActiveNoteId}
                            contentType={sidebarContentType}
                            customContent={sidebarCustomContent}
                        />
                    </div>
                )}

                <div
                    className={cn(
                        'flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out',
                        isShortcutsSidebarOpen && 'pr-[420px]'
                    )}
                >
                    <TopToolbar
                        noteName={sidebarActiveNoteId || 'Untitled'}
                        onToggleSidebar={() =>
                            setIsSidebarOpen((prev) => !prev)
                        }
                        onToggleDesktopSidebar={() =>
                            setIsDesktopSidebarOpen((prev) => !prev)
                        }
                        onSearch={(query) => {
                            // TODO: Implement search
                        }}
                        onToggleShortcuts={() =>
                            setIsShortcutsSidebarOpen((prev) => !prev)
                        }
                        onNavigatePrevious={handleNavigatePrevious}
                        onNavigateNext={handleNavigateNext}
                        canNavigatePrevious={canNavigatePrevious}
                        canNavigateNext={canNavigateNext}
                    />
                    {children}
                    <Footer />
                </div>

                {/* Settings Sidebar */}
                {/* Settings Sidebar */}
                {/* Settings Sidebar */}
                <SidebarMenu
                    open={isSettingsOpen}
                    onOpenChange={setIsSettingsOpen}
                />
            </div>

            <ShortcutsSidebar
                isOpen={isShortcutsSidebarOpen}
                onClose={() => setIsShortcutsSidebarOpen(false)}
            />

            {/* Storage Status Widget */}
            <StorageStatusToggle
                onClick={() => setIsStorageStatusOpen((prev) => !prev)}
            />
            <StorageStatusPanel
                isOpen={isStorageStatusOpen}
                onClose={() => setIsStorageStatusOpen(false)}
            />
        </div>
    )
}
