'use client'

import { EditorTabsBar } from '../../features/editor/components/editor-tabs-bar'
import { useEditorTabs } from '../../features/editor/tabs'
import { UnifiedSearch } from '../../features/search'
import { useSettings, useUserPreferences } from '../../features/settings'
import { useShortcut } from '../../features/shortcuts/use-shortcut'
import { TaskPanelStack } from '../../features/tasks'
import { useUIStore } from '../../stores/ui-store'
import { DevWidget } from '../dev-widget'
import { LeftToolbar } from '../left-toolbar'
import { RightSidebar } from '../right-sidebar'
import { Sidebar } from '../sidebar'
import { SidebarMenu } from '../sidebar-menu'
import { SidebarSkeleton } from '../sidebar/sidebar-skeleton'
import type { SidebarContentType } from '../sidebar/types'
import { AppLayoutShell } from './app-layout-shell'
import { Footer } from './footer'
import { MobileBottomNav } from './mobile-bottom-nav'
import { TopToolbar } from './top-toolbar'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { extractFirstHeading } from '@/features/notes/utils/extract-first-heading'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import { useSession } from '@/lib/auth-client'
import { isAuthPath } from '@/lib/auth-paths'
import { MOBILE_BREAKPOINT } from '@skriuw/shared/client'
import { useMediaQuery } from '@skriuw/shared/client'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useMemo, useCallback, useEffect, useRef } from 'react'

// import { AlphaBanner } from '../alpha-banner'
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
	sidebarCustomContent
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
		isRightSidebarOpen
	} = useUIStore()

	const { titleDisplayMode = 'filename', multiNoteTabs = false, getSetting } = useSettings()
	const sidebarHierarchyGuides = getSetting('sidebarHierarchyGuides') ?? false
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
		moveTabRight
	} = useEditorTabs()

	const notesInOrder = useMemo(() => flattenNotes(items), [items])

	const currentNote = useMemo(() => {
		if (!sidebarActiveNoteId) return null
		return notesInOrder.find((note) => note.id === sidebarActiveNoteId) || null
	}, [sidebarActiveNoteId, notesInOrder])

	const currentNoteId = currentNote?.id ?? null
	const isNoteView = Boolean(currentNoteId)

	const currentNoteIndex = useMemo(() => {
		if (!sidebarActiveNoteId) return -1
		return notesInOrder.findIndex((note) => note.id === sidebarActiveNoteId)
	}, [sidebarActiveNoteId, notesInOrder])

	// Compute title based on current page and titleDisplayMode setting
	const computedTitle = useMemo(() => {
		if (pathname.startsWith('/trash')) return 'Trash'
		if (pathname.startsWith('/archive')) return 'Data & Backup'
		if (pathname.startsWith('/profile')) return 'Profile'
		if (pathname.startsWith('/activity')) return 'Activity'
		if (pathname.startsWith('/tasks')) return 'Tasks'

		if (!currentNote) return 'Untitled'

		switch (titleDisplayMode) {
			case 'firstHeading': {
				const heading = extractFirstHeading(currentNote.content || [])
				return heading || currentNote.name || 'Untitled'
			}
			case 'aiGenerated':
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

	// Keep a ref to computedTitle to avoid re-triggering the effect when it changes
	const computedTitleRef = useRef(computedTitle)
	useEffect(() => {
		computedTitleRef.current = computedTitle
	}, [computedTitle])

	// Open/activate tab when navigating to a note
	useEffect(() => {
		if (!multiNoteTabs || !currentNoteId) return
		openTab({ noteId: currentNoteId, title: computedTitleRef.current })
		setActiveTab(currentNoteId)
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
				favorite: note.favorite ?? false
			}
		},
		[notesInOrder]
	)

	useShortcut('toggle-shortcuts', (e) => {
		e.preventDefault()
		toggleSettings()
	})

	useShortcut('toggle-sidebar', (e) => {
		e.preventDefault()
		toggleDesktopSidebar()
	})

	useShortcut('open-settings', (e) => {
		e.preventDefault()
		toggleSettings()
	})

	// Check if we are on an auth page (like login)
	const isAuthPage = isAuthPath(pathname)

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
							enabled: sidebarHierarchyGuides,
							style: 'solid',
							color: 'hsl(var(--muted-foreground))',
							opacity: 0.35
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
					onToggleRightSidebar={isNoteView ? toggleRightSidebar : undefined}
					isRightSidebarOpen={isRightSidebarOpen}
					onNavigatePrevious={sidebarActiveNoteId ? handleNavigatePrevious : undefined}
					onNavigateNext={sidebarActiveNoteId ? handleNavigateNext : undefined}
					canNavigatePrevious={canNavigatePrevious}
					canNavigateNext={canNavigateNext}
					isRawMDXMode={hasRawMDXMode}
					onToggleEditorMode={handleToggleEditorMode}
					showSidebar={showSidebar}
					showEditorModeToggle={!!sidebarActiveNoteId}
					showSplitToggle={false}
				/>
			}
			mainContent={
				<div className='flex h-full flex-col'>
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
			footer={
				<>
					<MobileBottomNav onSettingsClick={() => setSettingsOpen(true)} />
					<Footer />
				</>
			}
			rightPanel={
				<>
					<TaskPanelStack />
				</>
			}
			floatingWidgets={
				<>
					<SidebarMenu open={isSettingsOpen} onOpenChange={setSettingsOpen} />
					{isNoteView ? (
						<RightSidebar
							noteId={sidebarActiveNoteId || undefined}
							content={currentNote?.content}
						/>
					) : null}
					<UnifiedSearch />
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
