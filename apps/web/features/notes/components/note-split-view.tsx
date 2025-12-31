'use client'

import { useRouter } from 'next/navigation'
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type DragEvent,
	type PointerEvent as ReactPointerEvent,
} from 'react'


import { EmptyState } from '@skriuw/ui'
import { useShortcut } from '../../shortcuts'
import { NoteEditor } from '../../editor/components/note-editor'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '../hooks/use-note-slug'
import { NOTE_TAB_DRAG_TYPE } from '../constants'
import type { NoteTabDragPayload } from '../types'
import { useSplitViewStore } from '../split-view/store'
import { cn } from '@skriuw/shared'
import { useMediaQuery, MOBILE_BREAKPOINT } from '@skriuw/shared/client'
import { PaneHeader } from './pane-header'

type NoteSplitViewProps = {
	noteId: string
}

const MIN_SIZE = 0.15

function parseDragPayload(event: DragEvent): NoteTabDragPayload | null {
	const raw = event.dataTransfer.getData(NOTE_TAB_DRAG_TYPE)
	if (!raw) return null
	try {
		const parsed = JSON.parse(raw) as NoteTabDragPayload
		if (parsed?.noteId) {
			return parsed
		}
		return null
	} catch {
		return null
	}
}

export function NoteSplitView({ noteId }: NoteSplitViewProps) {
	const router = useRouter()
	const { items } = useNotesContext()
	const { getNoteUrl } = useNoteSlug(items)

	const panes = useSplitViewStore((state) => state.panes)
	const activePaneId = useSplitViewStore((state) => state.activePaneId)
	const orientation = useSplitViewStore((state) => state.orientation)
	const sizes = useSplitViewStore((state) => state.sizes)
	const toggleSplit = useSplitViewStore((state) => state.toggleSplit)
	const openSplitWithNote = useSplitViewStore((state) => state.openSplitWithNote)
	const setActivePane = useSplitViewStore((state) => state.setActivePane)
	const updatePaneNote = useSplitViewStore((state) => state.updatePaneNote)
	const ensurePrimaryPane = useSplitViewStore((state) => state.ensurePrimaryPane)
	const updatePaneScroll = useSplitViewStore((state) => state.updatePaneScroll)
	const cycleOrientation = useSplitViewStore((state) => state.cycleOrientation)
	const swapPanes = useSplitViewStore((state) => state.swapPanes)
	const focusPaneByIndex = useSplitViewStore((state) => state.focusPaneByIndex)
	const closeActivePane = useSplitViewStore((state) => state.closeActivePane)
	const closePane = useSplitViewStore((state) => state.closePane)
	const setSizes = useSplitViewStore((state) => state.setSizes)
	const setCurrentNoteId = useSplitViewStore((state) => state.setCurrentNoteId)
	const setOrientation = useSplitViewStore((state) => state.setOrientation)

	// Detect mobile viewport
	const isMobile = useMediaQuery(MOBILE_BREAKPOINT)

	// Force single-pane mode on mobile devices
	useEffect(() => {
		if (isMobile && orientation !== 'single') {
			setOrientation('single', noteId)
		}
	}, [isMobile, orientation, setOrientation, noteId])

	const containerRef = useRef<HTMLDivElement | null>(null)
	const dragStartRef = useRef<{ pos: number; sizes: number[] } | null>(null)
	const [isResizing, setIsResizing] = useState(false)
	const [dropTargetPaneId, setDropTargetPaneId] = useState<string | null>(null)

	// Track the last URL-driven noteId to prevent feedback loops.
	// When noteId changes (user clicked a note), we set this ref and skip URL updates
	// in the pane-sync effect until the panes have fully synced.
	const lastUrlNoteIdRef = useRef<string | null>(null)
	const isUrlDrivenUpdateRef = useRef(false)

	const activePane = useMemo(
		() => panes.find((pane) => pane.id === activePaneId) ?? panes[0],
		[panes, activePaneId]
	)

	// Consolidated effect: sync pane state when URL-derived noteId changes.
	// This replaces three separate effects to prevent race conditions.
	useEffect(() => {
		if (!noteId) return

		// Mark that we're in a URL-driven update to prevent the pane-sync effect
		// from triggering router.replace and creating a loop
		isUrlDrivenUpdateRef.current = true
		lastUrlNoteIdRef.current = noteId

		// Step 1: Update currentNoteId in store (handles layout restoration)
		setCurrentNoteId(noteId)

		// Step 2: Ensure primary pane exists (handled by setCurrentNoteId now)
		// ensurePrimaryPane is only needed for edge cases not covered by setCurrentNoteId
		// Keeping a redundant call here shouldn't cause issues since it's idempotent

		// Step 3: If active pane's noteId doesn't match URL, update it
		// Note: setCurrentNoteId already handles this for single-pane mode
		// This effect handles split-view scenarios where the active pane differs
		const currentActivePaneId = useSplitViewStore.getState().activePaneId
		const currentPanes = useSplitViewStore.getState().panes
		const pane = currentPanes.find((p) => p.id === currentActivePaneId)
		if (pane && pane.noteId !== noteId && useSplitViewStore.getState().orientation === 'single') {
			updatePaneNote(pane.id, noteId)
		}

		// Allow URL updates again after a microtask to let state settle
		queueMicrotask(() => {
			isUrlDrivenUpdateRef.current = false
		})
	}, [noteId, setCurrentNoteId, updatePaneNote])

	useEffect(() => {
		if (!activePaneId) return

		// Skip URL update if we're in a URL-driven update (prevents feedback loop)
		if (isUrlDrivenUpdateRef.current) {
			return
		}

		const pane = panes.find((p) => p.id === activePaneId)
		if (!pane?.noteId) {
			return
		}

		// Only update URL if the pane's noteId differs from the current URL's noteId
		// AND this is a user-initiated pane change (not a URL-driven update).
		// The key check: `noteId` is the URL-derived note. If pane.noteId matches noteId,
		// it means this is part of the URL->pane sync, so we should NOT update the URL back.
		if (pane.noteId === noteId) {
			return
		}

		// Also skip if the pane's noteId matches our last URL-driven noteId
		// (this catches cases where the state hasn't fully settled yet)
		if (pane.noteId === lastUrlNoteIdRef.current) {
			return
		}

		// Update URL immediately when user switches pane focus to a different note
		const url = getNoteUrl(pane.noteId)
		router.replace(url)
	}, [activePaneId, panes, router, getNoteUrl, noteId])

	useEffect(() => {
		if (orientation === 'single' && sizes[0] !== 1) {
			setSizes([1])
		}
		if (orientation !== 'single' && sizes.length < 2) {
			setSizes([0.5, 0.5])
		}
	}, [orientation, sizes, setSizes])

	const renderedPanes = orientation === 'single' ? panes.slice(0, 1) : panes.slice(0, 2)
	const renderedSizes =
		orientation === 'single'
			? [1]
			: sizes.length >= renderedPanes.length
				? sizes.slice(0, renderedPanes.length)
				: new Array(renderedPanes.length).fill(1 / renderedPanes.length)

	const handleDividerPointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (orientation === 'single' || renderedPanes.length < 2) {
				return
			}

			event.preventDefault()
			const axis = orientation === 'vertical' ? 'clientX' : 'clientY'
			const startPos = event.nativeEvent[axis]
			dragStartRef.current = {
				pos: startPos,
				sizes: renderedSizes,
			}
			setIsResizing(true)

			function handlePointerMove(moveEvent: PointerEvent) {
				if (!containerRef.current || !dragStartRef.current) return
				const containerSize =
					orientation === 'vertical'
						? containerRef.current.offsetWidth
						: containerRef.current.offsetHeight
				if (!containerSize) return

				const delta =
					(moveEvent[axis as 'clientX' | 'clientY'] - dragStartRef.current.pos) / containerSize

				const nextSizes = [...dragStartRef.current.sizes]
				nextSizes[0] = Math.min(Math.max(nextSizes[0] + delta, MIN_SIZE), 1 - MIN_SIZE)
				nextSizes[1] = Math.max(1 - nextSizes[0], MIN_SIZE)
				setSizes(nextSizes)
			}

			function handlePointerUp() {
				setIsResizing(false)
				dragStartRef.current = null
				window.removeEventListener('pointermove', handlePointerMove)
				window.removeEventListener('pointerup', handlePointerUp)
			}

			window.addEventListener('pointermove', handlePointerMove)
			window.addEventListener('pointerup', handlePointerUp)
		},
		[orientation, renderedPanes.length, renderedSizes, setSizes]
	)

	const handleDragOver = useCallback((paneId: string) => {
		return (event: DragEvent) => {
			if (!event.dataTransfer.types.includes(NOTE_TAB_DRAG_TYPE)) {
				return
			}
			event.preventDefault()
			setDropTargetPaneId(paneId)
		}
	}, [])

	const handleDragLeave = useCallback((paneId: string) => {
		return () => {
			setDropTargetPaneId((current) => (current === paneId ? null : current))
		}
	}, [])

	const handleDrop = useCallback(
		(paneId: string) => {
			return (event: DragEvent) => {
				const payload = parseDragPayload(event)
				setDropTargetPaneId(null)
				if (!payload?.noteId) {
					return
				}

				event.preventDefault()

				let targetPaneId = paneId

				if (orientation === 'single' && panes.length === 1 && panes[0]?.id === paneId) {
					const newPaneId =
						openSplitWithNote(panes[0]?.noteId ?? payload.noteId ?? noteId) ?? paneId
					targetPaneId = newPaneId
				}

				const latestState = useSplitViewStore.getState()
				if (!latestState.panes.some((pane) => pane.id === targetPaneId)) {
					targetPaneId = latestState.panes[latestState.panes.length - 1]?.id ?? paneId
				}

				updatePaneNote(targetPaneId, payload.noteId)
				setActivePane(targetPaneId)
				router.replace(getNoteUrl(payload.noteId))
			}
		},
		[
			getNoteUrl,
			noteId,
			openSplitWithNote,
			orientation,
			panes,
			router,
			setActivePane,
			updatePaneNote,
		]
	)

	const handlePaneScroll = useCallback(
		(paneId: string) => (event: React.UIEvent<HTMLDivElement>) => {
			updatePaneScroll(paneId, event.currentTarget.scrollTop)
		},
		[updatePaneScroll]
	)

	// Handler for selecting a different note from the pane header dropdown
	const handlePaneNoteSelect = useCallback(
		(paneId: string, selectedNoteId: string) => {
			updatePaneNote(paneId, selectedNoteId)
			setActivePane(paneId)
			// Update URL to reflect the newly selected note
			router.replace(getNoteUrl(selectedNoteId))
		},
		[updatePaneNote, setActivePane, router, getNoteUrl]
	)

	useShortcut('split.toggle', (event) => {
		event.preventDefault()
		toggleSplit(activePane?.noteId ?? noteId)
	})

	useShortcut('split.swap', (event) => {
		event.preventDefault()
		swapPanes()
	})

	useShortcut('split.orientation.next', (event) => {
		event.preventDefault()
		cycleOrientation(activePane?.noteId ?? noteId)
	})

	useShortcut('split.focus.left', (event) => {
		event.preventDefault()
		focusPaneByIndex(0)
	})

	useShortcut('split.focus.right', (event) => {
		event.preventDefault()
		focusPaneByIndex(1)
	})

	useShortcut('split.close', (event) => {
		event.preventDefault()
		closeActivePane()
	})

	return (
		<div className="flex h-full flex-1 flex-col overflow-hidden">
			<div
				ref={containerRef}
				className={cn(
					'flex flex-1 overflow-hidden rounded-md bg-background-secondary',
					orientation === 'horizontal' ? 'flex-col' : 'flex-row'
				)}
			>
				{renderedPanes.map((pane, index) => {
					const paneSize = renderedSizes[index] ?? 1 / renderedPanes.length
					const basis = `${paneSize * 100}%`
					const isActive = pane.id === activePaneId
					const isDropTarget = dropTargetPaneId === pane.id

					return (
						<div
							key={pane.id}
							style={{
								width: orientation === 'vertical' ? basis : '100%',
								height: orientation === 'horizontal' ? basis : '100%',
							}}
							className={cn(
								'relative flex flex-1 flex-col overflow-hidden transition-all duration-150',
								// Focus indicators - much stronger visual feedback
								isActive && 'ring-2 ring-primary/60 bg-primary/[0.02]',
								!isActive && orientation !== 'single' && 'ring-1 ring-border/50 opacity-90 hover:opacity-100',
								// Drop target styling
								isDropTarget && 'ring-2 ring-primary bg-primary/10'
							)}
							onClick={() => setActivePane(pane.id)}
							onDragOver={handleDragOver(pane.id)}
							onDragLeave={handleDragLeave(pane.id)}
							onDrop={handleDrop(pane.id)}
						>
							{/* Pane header - shown in split mode for note selection */}
							{orientation !== 'single' && (
								<PaneHeader
									paneId={pane.id}
									noteId={pane.noteId}
									isActive={isActive}
									isPrimary={index === 0}
									onNoteSelect={handlePaneNoteSelect}
									onClose={index > 0 ? () => closePane(pane.id) : undefined}
								/>
							)}
							<div className="flex-1 overflow-auto" onScroll={handlePaneScroll(pane.id)}>
								{pane.noteId ? (
									<NoteEditor
										key={`${pane.id}-${pane.editorKey}-${pane.noteId}`}
										noteId={pane.noteId}
										className="h-full"
									/>
								) : (
									<EmptyState
										message="Select a note"
										submessage="Drop a tab or choose a note from the sidebar"
										isFull
									/>
								)}
							</div>
						</div>
					)
				})}

				{orientation !== 'single' && renderedPanes.length > 1 && (
					<div
						role="separator"
						aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
						onPointerDown={handleDividerPointerDown}
						className={cn(
							'group flex items-center justify-center',
							orientation === 'vertical'
								? 'w-[3px] cursor-col-resize'
								: 'h-[3px] cursor-row-resize',
							isResizing ? 'bg-primary/60' : 'bg-border hover:bg-primary/40'
						)}
					>
						<div
							className={cn(
								'rounded-full bg-muted-foreground/50 group-hover:bg-primary/80',
								orientation === 'vertical' ? 'h-12 w-1' : 'w-12 h-1',
								isResizing && 'bg-primary'
							)}
						/>
					</div>
				)}
			</div>
		</div>
	)
}
