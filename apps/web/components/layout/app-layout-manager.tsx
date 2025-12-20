import { ReactNode, useMemo, useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { useMediaQuery, MOBILE_BREAKPOINT } from '@skriuw/core-logic/use-media-query'

import { EditorTabsBar } from '../../features/editor/components/editor-tabs-bar'
import { useEditorTabs } from '../../features/editor/tabs'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { extractFirstHeading } from '@/features/notes/utils/extract-first-heading'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'

import { useSettings, useUserPreferences } from '../../features/settings'
import { useShortcut } from '../../features/shortcuts/use-shortcut'
import { useSession } from '@/lib/auth-client'

import { useSplitViewStore } from '../../features/notes/split-view/store'

import { DevWidget } from '../dev-widget'
// import { AlphaBanner } from '../alpha-banner'
import { Footer } from './footer'
import { TopToolbar } from './top-toolbar'
import { LeftToolbar } from '../left-toolbar'
import { SidebarSkeleton } from '../sidebar/sidebar-skeleton'
import { SidebarMenu } from '../sidebar-menu'

import { useUIStore } from '../../stores/ui-store'

import { AppLayoutShell } from './app-layout-shell'

import type { SidebarContentType } from '../sidebar/types'

import { Sidebar } from '../sidebar'

import { TaskPanelStack } from '../../features/tasks'
import { RightSidebar } from '../right-sidebar'

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
	// Hide sidebar on archive/trash but keep it mounted for SPA-like behavior
	const showSidebar = !pathname.startsWith('/archive') && !pathname.startsWith('/trash')
	const { items, isInitialLoading, createNote, renameItem, deleteItem, pinItem, favoriteNote } =
		useNotesContext()

	// Auth check logic
	const { data: session, isPending } = useSession()

	useEffect(() => {
		// List of public paths that don't require auth (kept for reference)
		// const publicPaths = ['/login', '/register', '/auth/callback']
		// const isPublicPath = publicPaths.some(path => pathname.startsWith(path))

		// Removed forced redirect logic to allow public browsing
	}, [session, isPending, pathname, router])

	const { resolveNoteId, getNoteUrl } = useNoteSlug(items)
	const isNoteRoute = pathname.startsWith('/note/')
	const slugOrId = isNoteRoute ? pathname.split('/note/')[1]?.split('?')[0] : null
	const sidebarActiveNoteId = useMemo(() => {
		if (!slugOrId) return null
		return resolveNoteId(slugOrId)
	}, [slugOrId, resolveNoteId])

	const isMobile = useMediaQuery(MOBILE_BREAKPOINT)

	// Track if we've ever loaded to prevent showing skeleton during navigation
	const hasEverLoadedRef = useRef(false)

	const { toggleSplit, orientation, toggleActivePane, setOrientation } = useSplitViewStore()

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
		setLastActiveNote,
		toggleRightSidebar,
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

	// Compute title based on current page and titleDisplayMode setting
	const computedTitle = useMemo(() => {
		// Handle special pages that should show breadcrumbs instead of note titles
		if (pathname.startsWith('/trash')) {
			return 'Trash'
		}
		if (pathname.startsWith('/archive')) {
			return 'Data & Backup'
		}
		if (pathname.startsWith('/profile')) {
			return 'Profile'
		}
		if (pathname.startsWith('/activity')) {
			return 'Activity'
		}
		if (pathname.startsWith('/tasks')) {
			return 'Tasks'
		}

		// For note pages, use the existing logic
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
	}, [currentNote, titleDisplayMode, pathname])

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

	useEffect(() => {
		if (!multiNoteTabs) {
			clearTabs()
		}
	}, [multiNoteTabs, clearTabs])

	// Track last active note
	useEffect(() => {
		if (sidebarActiveNoteId) {
			setLastActiveNote(sidebarActiveNoteId)
		}
	}, [sidebarActiveNoteId, setLastActiveNote])

	// Open/activate tab when navigating to a note
	// Note: We intentionally exclude computedTitle from dependencies to avoid re-render loops
	// since openTab updates lastVisitedAt. Title updates happen separately when the tab bar renders.
	useEffect(() => {
		if (!multiNoteTabs || !currentNoteId) return
		openTab({ noteId: currentNoteId, title: computedTitle })
		setActiveTab(currentNoteId)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [multiNoteTabs, currentNoteId, openTab, setActiveTab])

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

	useShortcut('toggle-panes', (e) => {
		e.preventDefault()
		toggleActivePane()
	})

	useShortcut('split.vertical', (e) => {
		e.preventDefault()
		setOrientation('vertical', currentNoteId)
	})

	useShortcut('split.horizontal', (e) => {
		e.preventDefault()
		setOrientation('horizontal', currentNoteId)
	})

	// Check if we are on an auth page (like login)
	const isAuthPage = pathname.startsWith('/login')

	if (isAuthPage) {
		return (
			<>
				{children}
				{process.env.NODE_ENV === 'development' && <DevWidget />}
			</>
		)
	}

	return (
		<AppLayoutShell
			leftToolbar={<LeftToolbar onSettingsClick={() => setSettingsOpen(true)} />}
			sidebar={
				shouldShowSidebarSkeleton ? (
					<SidebarSkeleton />
				) : (
					<Sidebar
						activeNoteId={sidebarActiveNoteId || undefined}
						contentType={sidebarContentType}
						customContent={sidebarCustomContent}
						openTabIds={multiNoteTabs ? tabs.map((t) => t.noteId) : undefined}
						ruler={{
							enabled: false,
							style: 'solid',
							color: 'hsl(var(--muted-foreground))',
							opacity: 0.25,
						}}
					/>
				)
			}
			sidebarVisible={showSidebar}
			topToolbar={
				<TopToolbar
					noteName={computedTitle}
					onToggleSidebar={toggleMobileSidebar}
					onToggleDesktopSidebar={toggleDesktopSidebar}
					onToggleRightSidebar={toggleRightSidebar}
					// Navigation arrows - only show for note pages when navigation functions are available
					onNavigatePrevious={sidebarActiveNoteId ? handleNavigatePrevious : undefined}
					onNavigateNext={sidebarActiveNoteId ? handleNavigateNext : undefined}
					canNavigatePrevious={canNavigatePrevious}
					canNavigateNext={canNavigateNext}
					isRawMDXMode={hasRawMDXMode}
					onToggleEditorMode={handleToggleEditorMode}
					showSidebar={showSidebar}
					showEditorModeToggle={!!sidebarActiveNoteId}
					// Wire up split toggles - only show for note pages
					showSplitToggle={!!sidebarActiveNoteId}
					isSplitViewActive={orientation !== 'single'}
					onSplitToggle={() => toggleSplit(currentNoteId)}
					splitOrientation={orientation}
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
					<RightSidebar noteId={sidebarActiveNoteId || undefined} content={currentNote?.content} />

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
