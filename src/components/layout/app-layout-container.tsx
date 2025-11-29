import {
    ReactNode,
    useMemo,
    useCallback,
    Suspense,
    lazy,
    useEffect
} from 'react'
import { useNavigate } from 'react-router-dom'

import { useNotesWithSuspense } from '@/features/notes/hooks/useNotesWithSuspense'
import { extractFirstHeading } from '@/features/notes/utils/extract-first-heading'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import { useSettings, useUserPreferences } from '@/features/settings'
import { useEditorTabs } from '@/features/editor/tabs'
import { useShortcut } from '@/features/shortcuts/use-shortcut'
import { useUIStore } from '@/stores/ui-store'
import { useMediaQuery, MOBILE_BREAKPOINT } from '@/shared/utilities/use-media-query'

import { Footer } from '@/components/layout/footer'
import { TopToolbar } from '@/components/layout/top-toolbar'
import { LeftToolbar } from '@/components/left-toolbar'
import { SidebarSkeleton } from '@/components/sidebar/sidebar-skeleton'
import { SidebarMenu } from '@/components/sidebar-menu'
import { EditorTabsBar } from '@/features/editor/components/editor-tabs-bar'

import { AppLayoutShell } from './app-layout-shell'

import type { SidebarContentType } from '@/components/sidebar/types'

// Lazy load heavy components
const Sidebar = lazy(() =>
    import('@/components/sidebar').then((mod) => ({ default: mod.Sidebar }))
)
const ShortcutsSidebar = lazy(() =>
    import('@/features/shortcuts/components').then((mod) => ({
        default: mod.ShortcutsSidebar
    }))
)
const StorageStatusToggle = lazy(() =>
    import('@/features/storage-status').then((mod) => ({
        default: mod.StorageStatusToggle
    }))
)
const StorageStatusPanel = lazy(() =>
    import('@/features/storage-status').then((mod) => ({
        default: mod.StorageStatusPanel
    }))
)

type AppLayoutContainerProps = {
    children: ReactNode
    showSidebar?: boolean
    sidebarActiveNoteId?: string
    sidebarContentType?: SidebarContentType
    sidebarCustomContent?: ReactNode
}

/**
 * Container component that handles data loading and state management
 * Wraps the pure AppLayoutShell with data and logic
 */
export function AppLayoutContainer({
		children,
    showSidebar = true,
    sidebarActiveNoteId,
    sidebarContentType,
    sidebarCustomContent
}: AppLayoutContainerProps) {
    const navigate = useNavigate()
    const { items, isInitialLoading } = useNotesWithSuspense()
    const isMobile = useMediaQuery(MOBILE_BREAKPOINT)
    const {
        isMobileSidebarOpen,
        toggleMobileSidebar,
        isDesktopSidebarOpen,
        toggleDesktopSidebar,
        isShortcutsSidebarOpen,
        toggleShortcutsSidebar,
        setShortcutsSidebarOpen,
        isSettingsOpen,
        toggleSettings,
        setSettingsOpen,
        isStorageStatusOpen,
        toggleStorageStatus,
        setStorageStatusOpen
    } = useUIStore()
    const { titleDisplayMode = 'filename', multiNoteTabs = false } = useSettings()
    const { hasRawMDXMode, toggle: togglePreference } = useUserPreferences()
    const {
        tabs,
        activeNoteId,
        openTab,
        closeTab,
        setActiveTab,
        clearTabs,
        pruneTabs
    } = useEditorTabs()

    const notesInOrder = useMemo(() => flattenNotes(items), [items])

    const currentNote = useMemo(() => {
        if (!sidebarActiveNoteId) return null
        return notesInOrder.find((note) => note.id === sidebarActiveNoteId) || null
    }, [sidebarActiveNoteId, notesInOrder])
    const currentNoteId = currentNote?.id ?? null

    const currentNoteIndex = useMemo(() => {
        if (!sidebarActiveNoteId) return -1
        return notesInOrder.findIndex((note) => note.id === sidebarActiveNoteId)
    }, [sidebarActiveNoteId, notesInOrder])

    // Compute title based on titleDisplayMode setting
    const computedTitle = useMemo(() => {
        if (!currentNote) {
            return 'Untitled'
        }

        switch (titleDisplayMode) {
            case 'firstHeading': {
                const heading = extractFirstHeading(currentNote.content || [])
                return heading || currentNote.name || 'Untitled'
            }
            case 'aiGenerated':
                // Coming soon - for now, fall back to filename
                return currentNote.name || 'Untitled'
            case 'filename':
            default:
                return currentNote.name || 'Untitled'
        }
    }, [currentNote, titleDisplayMode])

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

    const handleToggleEditorMode = useCallback(() => {
        togglePreference('rawMDXMode')
    }, [togglePreference])

    useEffect(() => {
        if (!multiNoteTabs) {
            clearTabs()
        }
    }, [multiNoteTabs, clearTabs])

    useEffect(() => {
        if (!multiNoteTabs || !currentNoteId) return
        openTab({ noteId: currentNoteId, title: computedTitle })
        setActiveTab(currentNoteId)
    }, [multiNoteTabs, currentNoteId, computedTitle, openTab, setActiveTab])

    useEffect(() => {
        if (!multiNoteTabs || !tabs.length) return
        if (!notesInOrder.length) {
            if (!isInitialLoading) {
                clearTabs()
            }
            return
        }
        const validIds = new Set(notesInOrder.map((note) => note.id))
        pruneTabs(validIds)
    }, [multiNoteTabs, tabs, notesInOrder, pruneTabs, isInitialLoading, clearTabs])

    const handleSelectTab = useCallback(
        (noteId: string) => {
            if (!multiNoteTabs) return
            setActiveTab(noteId)
            if (noteId !== sidebarActiveNoteId) {
                navigate(`/note/${noteId}`)
            }
        },
        [multiNoteTabs, navigate, setActiveTab, sidebarActiveNoteId]
    )

    const handleCloseTab = useCallback(
        (noteId: string) => {
            if (!multiNoteTabs) return
            const fallbackId = closeTab(noteId)
            if (sidebarActiveNoteId === noteId) {
                if (fallbackId) {
                    navigate(`/note/${fallbackId}`)
                } else {
                    navigate('/')
                }
            }
        },
        [closeTab, multiNoteTabs, navigate, sidebarActiveNoteId]
    )

    useShortcut('toggle-shortcuts', (e) => {
        e.preventDefault()
        toggleShortcutsSidebar()
    })

    useShortcut('toggle-sidebar', (e) => {
        e.preventDefault()
        toggleDesktopSidebar()
    })

    useShortcut('open-settings', (e) => {
        e.preventDefault()
        toggleSettings()
    })

    useShortcut('toggle-data-browser', (e) => {
        e.preventDefault()
        toggleStorageStatus()
    })

    return (
        <AppLayoutShell
            leftToolbar={
                <LeftToolbar onSettingsClick={() => setSettingsOpen(true)} />
            }
            sidebar={
                showSidebar ? (
                    <Suspense fallback={<SidebarSkeleton />}>
                        {isInitialLoading ? (
                            <SidebarSkeleton />
                        ) : (
                            <Sidebar
                                activeNoteId={sidebarActiveNoteId}
                                contentType={sidebarContentType}
                                customContent={sidebarCustomContent}
                                ruler={{
                                    enabled: false,
                                    style: "solid",
                                    color: "hsl(var(--muted-foreground))",
                                    opacity: 0.25,
                                }}
                            />
                        )}
                    </Suspense>
                ) : null
            }
            topToolbar={
                <TopToolbar
                    noteName={computedTitle}
                    onToggleSidebar={toggleMobileSidebar}
                    onToggleDesktopSidebar={toggleDesktopSidebar}
                    onSearch={() => {
                        // TODO: Implement search
                    }}
                    onToggleShortcuts={toggleShortcutsSidebar}
                    onNavigatePrevious={handleNavigatePrevious}
                    onNavigateNext={handleNavigateNext}
                    canNavigatePrevious={canNavigatePrevious}
                    canNavigateNext={canNavigateNext}
                    isRawMDXMode={hasRawMDXMode}
                    onToggleEditorMode={handleToggleEditorMode}
                />
            }
            mainContent={
                <div className="flex h-full flex-col">
                    {multiNoteTabs && tabs.length > 0 && (
                        <EditorTabsBar
                            tabs={tabs}
                            activeNoteId={activeNoteId}
                            onSelect={handleSelectTab}
                            onClose={handleCloseTab}
                        />
                    )}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-background-secondary">
                        {children}
                    </div>
                </div>
            }
            footer={<Footer />}
            rightPanel={
                <Suspense fallback={null}>
                    <ShortcutsSidebar
                        isOpen={isShortcutsSidebarOpen}
                        onClose={() => toggleShortcutsSidebar()}
                    />
                </Suspense>
            }
            floatingWidgets={
                <>
                    <SidebarMenu
                        open={isSettingsOpen}
                        onOpenChange={setSettingsOpen}
                    />
                    {!isMobile && (
                        <Suspense fallback={null}>
                            <StorageStatusToggle
                                onClick={toggleStorageStatus}
                            />
                            <StorageStatusPanel
                                isOpen={isStorageStatusOpen}
                                onClose={() => setStorageStatusOpen(false)}
                            />
                        </Suspense>
                    )}
                </>
            }
            isRightPanelOpen={isShortcutsSidebarOpen}
            isSidebarOpen={isMobileSidebarOpen}
            isDesktopSidebarOpen={isDesktopSidebarOpen}
            onSidebarClose={isMobile ? toggleMobileSidebar : undefined}
        />
    )
}
