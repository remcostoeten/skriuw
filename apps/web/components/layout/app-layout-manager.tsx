import { ReactNode, useMemo, useCallback, useEffect, useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { useMediaQuery, MOBILE_BREAKPOINT } from '@skriuw/core-logic/use-media-query'

import { EditorTabsBar } from '../../features/editor/components/editor-tabs-bar'
import { SplitEditorLayout } from '../../features/editor/components/split-editor-layout'
import { useEditorTabs } from '../../features/editor/tabs'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { extractFirstHeading } from '@/features/notes/utils/extract-first-heading'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import { GlobalSearchDialog } from '../../features/search'
import { useSettings, useUserPreferences } from '../../features/settings'
import { useShortcut } from '../../features/shortcuts/use-shortcut'

import { DevWidget } from '../dev-widget'
// import { AlphaBanner } from '../alpha-banner'
import { Footer } from './footer'
import { TopToolbar } from './top-toolbar'
import { LeftToolbar } from '../left-toolbar'
import { SidebarSkeleton } from '../sidebar/sidebar-skeleton'
import { SidebarMenu } from '../sidebar-menu'

import { useUIStore } from '../../stores/ui-store'

import { AppLayoutShell } from './app-layout-shell'
import { ChevronRight, Sparkles } from 'lucide-react'

import type { SidebarContentType } from '../sidebar/types'

// Import Sidebar directly - no lazy loading to prevent skeleton during navigation
import { Sidebar } from '../sidebar'

import { TaskPanelStack } from '../../features/tasks'

type AppLayoutManagerProps = {
	children: ReactNode
	sidebarContentType?: SidebarContentType
	sidebarCustomContent?: ReactNode
}

/**
 * Container component that handles data loading and state management
 * Wraps the pure AppLayoutShell with data and logic
 */
export function AppLayoutManager({
	children,
	sidebarContentType,
	sidebarCustomContent,
}: AppLayoutManagerProps) {
	const router = useRouter()
	const pathname = usePathname()
	const showSidebar = !pathname.startsWith('/archive') && !pathname.startsWith('/trash')
	const { items, isInitialLoading, createNote, renameItem, deleteItem, pinItem, favoriteNote } =
		useNotesContext()

	const { resolveNoteId, getNoteUrl } = useNoteSlug(items)
	const isNoteRoute = pathname.startsWith('/note/')
	const slugOrId = isNoteRoute ? pathname.split('/note/')[1]?.split('?')[0] : null
	const sidebarActiveNoteId = useMemo(() => {
		if (!slugOrId) return null
		return resolveNoteId(slugOrId)
	}, [slugOrId, resolveNoteId])

	const isMobile = useMediaQuery(MOBILE_BREAKPOINT)
	const [isSearchOpen, setIsSearchOpen] = useState(false)
	// Track if we've ever loaded to prevent showing skeleton during navigation
	const hasEverLoadedRef = useRef(false)
	const [isSplitView, setIsSplitView] = useState(false)
	const [splitPanes, setSplitPanes] = useState<{ id: string; noteId: string | null }[]>([
		{ id: 'primary', noteId: null },
	])
	const [activePaneId, setActivePaneId] = useState('primary')
	const [splitRatio, setSplitRatio] = useState(0.5)
	const [splitOrientation, setSplitOrientation] = useState<'vertical' | 'horizontal'>('vertical')

	// Update ref when loading completes
	useEffect(() => {
		if (!isInitialLoading) {
			hasEverLoadedRef.current = true
		}
	}, [isInitialLoading])

	// Only show skeleton on true initial load, not during navigation
	const shouldShowSidebarSkeleton = isInitialLoading && !hasEverLoadedRef.current
	const {
		isMobileSidebarOpen,
		toggleMobileSidebar,
		isDesktopSidebarOpen,
		toggleDesktopSidebar,
		isSettingsOpen,
		toggleSettings,
		setSettingsOpen,
		taskStack,
		closeAllTasks,
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
		pruneTabs,
		reorderTabs,
		closeOtherTabs,
		closeTabsToRight,
		closeTabsToLeft,
		moveTabLeft,
		moveTabRight,
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

	useEffect(() => {
		if (!isNoteRoute) {
			setIsSplitView(false)
			setSplitPanes([{ id: 'primary', noteId: null }])
			setActivePaneId('primary')
		}
	}, [isNoteRoute])

	useEffect(() => {
		if (!currentNoteId) return
		setSplitPanes((prev) => {
			if (!prev.length) {
				return [{ id: 'primary', noteId: currentNoteId }]
			}
			const hasActivePane = prev.some((pane) => pane.id === activePaneId)
			const nextPanes = prev.map((pane, index) => {
				if (pane.id === activePaneId || (!hasActivePane && index === 0)) {
					return { ...pane, noteId: currentNoteId }
				}
				if (pane.noteId === null) {
					return { ...pane, noteId: currentNoteId }
				}
				return pane
			})
			return nextPanes
		})
	}, [currentNoteId, activePaneId])

	useEffect(() => {
		if (!isSplitView) {
			setSplitPanes((prev) => {
				const activePane = prev.find((pane) => pane.id === activePaneId)
				const fallbackNoteId = activePane?.noteId ?? currentNoteId ?? null
				return [{ id: 'primary', noteId: fallbackNoteId }]
			})
			setActivePaneId('primary')
		}
	}, [isSplitView, activePaneId, currentNoteId])

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
			router.push(getNoteUrl(previousNote.id))
		}
	}, [currentNoteIndex, notesInOrder, router, getNoteUrl])

	const handleNavigateNext = useCallback(() => {
		if (currentNoteIndex >= 0 && currentNoteIndex < notesInOrder.length - 1) {
			const nextNote = notesInOrder[currentNoteIndex + 1]
			router.push(getNoteUrl(nextNote.id))
		}
	}, [currentNoteIndex, notesInOrder, router, getNoteUrl])

	const canNavigatePrevious = currentNoteIndex > 0
	const canNavigateNext = currentNoteIndex >= 0 && currentNoteIndex < notesInOrder.length - 1

	const handleToggleEditorMode = useCallback(() => {
		togglePreference('rawMDXMode')
	}, [togglePreference])

	const handleToggleSplitView = useCallback(() => {
		if (!isNoteRoute) return
		setIsSplitView((prev) => {
			if (prev) return false
			setSplitPanes((current) => {
				const activePane = current.find((pane) => pane.id === activePaneId)
				const baseNoteId = activePane?.noteId ?? currentNoteId ?? null
				const firstPane = current[0]
					? { ...current[0], noteId: current[0].noteId ?? baseNoteId }
					: { id: 'primary', noteId: baseNoteId }
				const secondPane = current[1]
					? { ...current[1], noteId: current[1].noteId ?? baseNoteId }
					: { id: 'secondary', noteId: baseNoteId }
				return [firstPane, secondPane]
			})
			return true
		})
	}, [activePaneId, currentNoteId, isNoteRoute])

	const handleCycleSplitOrientation = useCallback(() => {
		setSplitOrientation((prev) => (prev === 'vertical' ? 'horizontal' : 'vertical'))
	}, [])

	const handleClosePane = useCallback(
		(paneId: string) => {
			setSplitPanes((prev) => {
				if (prev.length <= 1) return prev
				const wasActive = activePaneId === paneId
				const remaining = prev.filter((pane) => pane.id !== paneId)
				if (!remaining.length) {
					setIsSplitView(false)
					setActivePaneId('primary')
					return [{ id: 'primary', noteId: currentNoteId ?? null }]
				}
				if (remaining.length === 1) {
					setIsSplitView(false)
					setActivePaneId(remaining[0].id)
				} else if (wasActive) {
					setActivePaneId(remaining[0].id)
				}
				return remaining
			})
		},
		[activePaneId, currentNoteId]
	)

	const handleSwapPanes = useCallback(() => {
		setSplitPanes((prev) => {
			if (prev.length < 2) return prev
			const swapped = [prev[1], prev[0], ...prev.slice(2)]
			if (activePaneId === prev[0].id) {
				setActivePaneId(prev[1].id)
			} else if (activePaneId === prev[1].id) {
				setActivePaneId(prev[0].id)
			}
			return swapped
		})
	}, [activePaneId])

	const handleAssignNoteToPane = useCallback((paneId: string, noteId: string) => {
		setSplitPanes((prev) => prev.map((pane) => (pane.id === paneId ? { ...pane, noteId } : pane)))
		setActivePaneId(paneId)
	}, [])

	const handlePaneClick = useCallback((paneId: string) => {
		setActivePaneId(paneId)
	}, [])

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
				router.push(getNoteUrl(noteId))
			}
		},
		[multiNoteTabs, router, setActiveTab, sidebarActiveNoteId, getNoteUrl]
	)

	const handleCloseTab = useCallback(
		(noteId: string) => {
			if (!multiNoteTabs) return
			const fallbackId = closeTab(noteId)
			if (sidebarActiveNoteId === noteId) {
				if (fallbackId) {
					router.push(getNoteUrl(fallbackId))
				} else {
					router.push('/')
				}
			}
		},
		[closeTab, multiNoteTabs, router, sidebarActiveNoteId, getNoteUrl]
	)

	const handleCreateNote = useCallback(async () => {
		if (!multiNoteTabs) return
		const newNote = await createNote('Untitled')
		if (newNote) {
			const url = getNoteUrl(newNote.id)
			router.push(`${url}?focus=true`)
		}
	}, [createNote, router, multiNoteTabs, getNoteUrl])

	const handleDuplicateTab = useCallback(
		(noteId: string) => {
			if (!multiNoteTabs) return
			// Just open the same note again (it will create a new tab if needed)
			openTab({ noteId }, { activate: true })
			setActiveTab(noteId)
			router.push(getNoteUrl(noteId))
		},
		[multiNoteTabs, openTab, setActiveTab, router, getNoteUrl]
	)

	const handleRenameNote = useCallback(
		async (noteId: string) => {
			const note = notesInOrder.find((n) => n.id === noteId)
			if (!note) return
			const newName = prompt('Enter new name:', note.name)
			if (newName && newName.trim() && newName !== note.name) {
				await renameItem(noteId, newName.trim())
			}
		},
		[notesInOrder, renameItem]
	)

	const handleDeleteNote = useCallback(
		async (noteId: string) => {
			const note = notesInOrder.find((n) => n.id === noteId)
			if (!note) return
			await deleteItem(noteId)
		},
		[notesInOrder, deleteItem]
	)

	const handlePinNote = useCallback(
		async (noteId: string, pinned: boolean) => {
			await pinItem(noteId, 'note', pinned)
		},
		[pinItem]
	)

	const handleFavoriteNote = useCallback(
		async (noteId: string, favorite: boolean) => {
			await favoriteNote(noteId, favorite)
		},
		[favoriteNote]
	)

	const getNoteData = useCallback(
		(noteId: string) => {
			const note = notesInOrder.find((n) => n.id === noteId)
			if (!note) return null
			return {
				pinned: note.pinned ?? false,
				favorite: note.favorite ?? false,
			}
		},
		[notesInOrder]
	)

	useShortcut('toggle-shortcuts', (e) => {
		e.preventDefault()
		toggleSettings()
		// Ideally we would also set the active tab to 'shortcuts' here
	})

	useShortcut('toggle-sidebar', (e) => {
		e.preventDefault()
		toggleDesktopSidebar()
	})

	useShortcut('open-settings', (e) => {
		e.preventDefault()
		toggleSettings()
	})

	useShortcut('search-notes', (e) => {
		e.preventDefault()
		setIsSearchOpen(true)
	})

	return (
		<AppLayoutShell
			leftToolbar={<LeftToolbar onSettingsClick={() => setSettingsOpen(true)} />}
			sidebar={
				showSidebar ? (
					shouldShowSidebarSkeleton ? (
						<SidebarSkeleton />
					) : (
						<Sidebar
							activeNoteId={sidebarActiveNoteId || undefined}
							contentType={sidebarContentType}
							customContent={sidebarCustomContent}
							openTabIds={multiNoteTabs ? new Set(tabs.map((t) => t.noteId)) : undefined}
							ruler={{
								enabled: false,
								style: 'solid',
								color: 'hsl(var(--muted-foreground))',
								opacity: 0.25,
							}}
						/>
					)
				) : null
			}
			topToolbar={
				<TopToolbar
					noteName={computedTitle}
					onToggleSidebar={toggleMobileSidebar}
					onToggleDesktopSidebar={toggleDesktopSidebar}
					onSearch={() => {
						setIsSearchOpen(true)
					}}
					onNavigatePrevious={handleNavigatePrevious}
					onNavigateNext={handleNavigateNext}
					canNavigatePrevious={canNavigatePrevious}
					canNavigateNext={canNavigateNext}
					isRawMDXMode={hasRawMDXMode}
					onToggleEditorMode={handleToggleEditorMode}
					showSidebar={showSidebar}
					showEditorModeToggle={!!sidebarActiveNoteId}
				/>
			}
			mainContent={
				<div className="flex h-full flex-col">
					{multiNoteTabs && (
						<EditorTabsBar
							tabs={tabs}
							activeNoteId={activeNoteId}
							onSelect={handleSelectTab}
							onClose={handleCloseTab}
							onReorder={reorderTabs}
							onCreateNote={handleCreateNote}
							onCloseOtherTabs={closeOtherTabs}
							onCloseTabsToRight={closeTabsToRight}
							onCloseTabsToLeft={closeTabsToLeft}
							onCloseAllTabs={clearTabs}
							onDuplicateTab={handleDuplicateTab}
							onMoveTabLeft={moveTabLeft}
							onMoveTabRight={moveTabRight}
							onRenameNote={handleRenameNote}
							onDeleteNote={handleDeleteNote}
							onPinNote={handlePinNote}
							onFavoriteNote={handleFavoriteNote}
							getNoteData={getNoteData}
						/>
					)}
					<div
						className={`flex-1 overflow-y-auto overflow-x-hidden bg-background-secondary ${multiNoteTabs ? 'pt-3' : ''}`}
					>
						{children}
					</div>
				</div>
			}
			footer={<Footer />}
			rightPanel={
				<>
					<TaskPanelStack />
				</>
			}
			floatingWidgets={
				<>
					<SidebarMenu open={isSettingsOpen} onOpenChange={setSettingsOpen} />
					<GlobalSearchDialog open={isSearchOpen} onOpenChange={setIsSearchOpen} />
					{/* <AlphaBanner
						href="/docs"
						text="New! PrismUI Components"
						icon={<Sparkles className="h-4 w-4" />}
						endIcon={<ChevronRight className="h-4 w-4" />}
					/> */}
					{process.env.NODE_ENV === 'development' && <DevWidget />}
				</>
			}
			isRightPanelOpen={taskStack.length > 0}
			isTaskPanelOpen={taskStack.length > 0}
			isSidebarOpen={isMobileSidebarOpen}
			isDesktopSidebarOpen={isDesktopSidebarOpen}
			onSidebarClose={isMobile ? toggleMobileSidebar : undefined}
		/>
	)
}
