import { ReactNode, useState, useMemo, useCallback, Suspense, lazy } from 'react'
import { useNavigate } from 'react-router-dom'

import { useNotesWithSuspense } from '@/features/notes/hooks/useNotesWithSuspense'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import { useShortcut } from '@/features/shortcuts/use-shortcut'

import { Footer } from '@/components/layout/footer'
import { TopToolbar } from '@/components/layout/top-toolbar'
import { LeftToolbar } from '@/components/left-toolbar'
import { SidebarMenu } from '@/components/sidebar-menu'
import { SidebarSkeleton } from '@/components/sidebar/sidebar-skeleton'
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

interface AppLayoutContainerProps {
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
		if (currentNoteIndex >= 0 && currentNoteIndex < notesInOrder.length - 1) {
			const nextNote = notesInOrder[currentNoteIndex + 1]
			navigate(`/note/${nextNote.id}`)
		}
	}, [currentNoteIndex, notesInOrder, navigate])

	const canNavigatePrevious = currentNoteIndex > 0
	const canNavigateNext =
		currentNoteIndex >= 0 && currentNoteIndex < notesInOrder.length - 1

	// Keyboard shortcuts
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
		<AppLayoutShell
			leftToolbar={
				<LeftToolbar onSettingsClick={() => setIsSettingsOpen(true)} />
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
							/>
						)}
					</Suspense>
				) : null
			}
			topToolbar={
				<TopToolbar
					noteName={sidebarActiveNoteId || 'Untitled'}
					onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
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
			}
			mainContent={children}
			footer={<Footer />}
			rightPanel={
				<Suspense fallback={null}>
					<ShortcutsSidebar
						isOpen={isShortcutsSidebarOpen}
						onClose={() => setIsShortcutsSidebarOpen(false)}
					/>
				</Suspense>
			}
			floatingWidgets={
				<>
					<SidebarMenu open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
					<Suspense fallback={null}>
						<StorageStatusToggle
							onClick={() => setIsStorageStatusOpen((prev) => !prev)}
						/>
						<StorageStatusPanel
							isOpen={isStorageStatusOpen}
							onClose={() => setIsStorageStatusOpen(false)}
						/>
					</Suspense>
				</>
			}
			isRightPanelOpen={isShortcutsSidebarOpen}
			isSidebarOpen={isSidebarOpen}
			isDesktopSidebarOpen={isDesktopSidebarOpen}
		/>
	)
}

