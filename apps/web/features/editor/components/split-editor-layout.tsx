'use client'

import { ReactNode, useCallback, useMemo, useRef, useState } from 'react'

import { cn } from '@skriuw/shared'
import { IconButton } from '@skriuw/ui/icons'

import {
	LayoutPanelLeft,
	RotateCcw,
	Split,
	StretchHorizontal,
	StretchVertical,
	X,
} from 'lucide-react'

type SplitPane = {
	id: string
	noteId: string | null
}

type SplitEditorLayoutProps = {
	panes: SplitPane[]
	isSplit: boolean
	activePaneId: string
	splitRatio: number
	orientation: 'vertical' | 'horizontal'
	onToggleSplit: () => void
	onPaneClick: (paneId: string) => void
	onClosePane: (paneId: string) => void
	onSwapPanes: () => void
	onResize: (ratio: number) => void
	onToggleOrientation?: () => void
	onAssignNote?: (paneId: string, noteId: string) => void
	renderPane: (pane: SplitPane) => ReactNode
}

const NOTE_DATA_TYPE = 'application/x-skriuw-note-id'

export function SplitEditorLayout({
	panes,
	isSplit,
	activePaneId,
	splitRatio,
	orientation,
	onToggleSplit,
	onPaneClick,
	onClosePane,
	onSwapPanes,
	onResize,
	onToggleOrientation,
	onAssignNote,
	renderPane,
}: SplitEditorLayoutProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const [isDragging, setIsDragging] = useState(false)
	const [draggingPane, setDraggingPane] = useState<string | null>(null)

	const primaryPane = panes[0]
	const secondaryPane = panes[1]

	const clampedRatio = useMemo(() => Math.min(0.8, Math.max(0.2, splitRatio)), [splitRatio])

	const handlePointerDown = useCallback(
		(event: React.PointerEvent) => {
			if (!containerRef.current) return
			setIsDragging(true)
			const startPosition = orientation === 'vertical' ? event.clientX : event.clientY
			const containerRect = containerRef.current.getBoundingClientRect()
			const containerSize = orientation === 'vertical' ? containerRect.width : containerRect.height
			const startRatio = clampedRatio

			const handleMove = (moveEvent: PointerEvent) => {
				const delta =
					orientation === 'vertical'
						? moveEvent.clientX - startPosition
						: moveEvent.clientY - startPosition
				const nextRatio = startRatio + delta / containerSize
				onResize(Math.min(0.8, Math.max(0.2, nextRatio)))
			}

			const handleUp = () => {
				setIsDragging(false)
				window.removeEventListener('pointermove', handleMove)
				window.removeEventListener('pointerup', handleUp)
			}

			window.addEventListener('pointermove', handleMove)
			window.addEventListener('pointerup', handleUp)
		},
		[clampedRatio, onResize, orientation]
	)

	const handleDrop = useCallback(
		(event: React.DragEvent, paneId: string) => {
			if (!onAssignNote) return
			const noteId =
				event.dataTransfer.getData(NOTE_DATA_TYPE) || event.dataTransfer.getData('text/plain')
			if (!noteId) return
			event.preventDefault()
			onAssignNote(paneId, noteId)
			setDraggingPane(null)
		},
		[onAssignNote]
	)

	const handleDragOver = useCallback((event: React.DragEvent, paneId: string) => {
		if (event.dataTransfer.types.includes(NOTE_DATA_TYPE)) {
			event.preventDefault()
			setDraggingPane(paneId)
		}
	}, [])

	const handleDragLeave = useCallback(() => {
		setDraggingPane(null)
	}, [])

	const renderPaneControls = (pane: SplitPane, isPrimary: boolean) => (
		<div className="absolute right-2 top-2 flex items-center gap-1 text-muted-foreground">
			{isSplit && panes.length > 1 && (
				<IconButton
					icon={<RotateCcw className="w-3.5 h-3.5" />}
					tooltip="Swap panes"
					variant="toolbar"
					onClick={onSwapPanes}
				/>
			)}
			{isSplit && (!isPrimary || panes.length > 1) && (
				<IconButton
					icon={<X className="w-3.5 h-3.5" />}
					tooltip="Close pane"
					variant="toolbar"
					onClick={() => onClosePane(pane.id)}
				/>
			)}
		</div>
	)

	const renderPaneContainer = (pane: SplitPane, isPrimary: boolean) => (
		<div
			key={pane.id}
			className={cn(
				'relative flex-1 overflow-hidden rounded-md bg-background-secondary',
				isSplit && 'border border-border',
				isSplit && !isPrimary && (orientation === 'vertical' ? 'ml-2' : 'mt-2'),
				activePaneId === pane.id && 'ring-1 ring-primary/40',
				draggingPane === pane.id && 'outline outline-dashed outline-primary'
			)}
			onClick={() => onPaneClick(pane.id)}
			onDragOver={(event) => handleDragOver(event, pane.id)}
			onDragLeave={handleDragLeave}
			onDrop={(event) => handleDrop(event, pane.id)}
		>
			{renderPaneControls(pane, isPrimary)}
			<div className="h-full w-full" data-pane-active={activePaneId === pane.id}>
				{renderPane(pane)}
			</div>
		</div>
	)

	if (!isSplit || panes.length < 2 || !secondaryPane) {
		return (
			<div className="flex h-full flex-col gap-2">
				<div className="flex items-center justify-end gap-2">
					<IconButton
						icon={<LayoutPanelLeft className="w-4 h-4" />}
						tooltip="Split editor"
						variant="toolbar"
						onClick={onToggleSplit}
					/>
				</div>
				{renderPaneContainer(primaryPane, true)}
			</div>
		)
	}

	return (
		<div className="flex h-full flex-col" ref={containerRef}>
			<div className="flex items-center justify-end gap-2 pb-2">
				<IconButton
					icon={<Split className="w-4 h-4" />}
					tooltip="Toggle split"
					variant="toolbar"
					onClick={onToggleSplit}
				/>
				{isSplit && onToggleOrientation && (
					<IconButton
						icon={
							orientation === 'vertical' ? (
								<StretchVertical className="w-4 h-4" />
							) : (
								<StretchHorizontal className="w-4 h-4" />
							)
						}
						tooltip={
							orientation === 'vertical' ? 'Switch to horizontal split' : 'Switch to vertical split'
						}
						variant="toolbar"
						onClick={onToggleOrientation}
					/>
				)}
			</div>
			<div
				className={cn('flex min-h-0 flex-1', orientation === 'vertical' ? 'flex-row' : 'flex-col')}
			>
				<div className="flex-1 min-h-0 min-w-0" style={{ flexBasis: `${clampedRatio * 100}%` }}>
					{renderPaneContainer(primaryPane, true)}
				</div>

				<div
					className={cn(
						'relative select-none transition-colors',
						orientation === 'vertical' ? 'mx-1 w-1 cursor-col-resize' : 'my-1 h-1 cursor-row-resize'
					)}
					onPointerDown={handlePointerDown}
				>
					<div
						className={cn(
							'absolute',
							orientation === 'vertical'
								? 'inset-y-0 -left-1.5 right-0'
								: '-top-1.5 left-0 right-0 bottom-0',
							isDragging ? 'bg-primary/60' : 'bg-border hover:bg-primary/40'
						)}
					/>
				</div>

				<div
					className="flex-1 min-h-0 min-w-0"
					style={{ flexBasis: `${(1 - clampedRatio) * 100}%` }}
				>
					{renderPaneContainer(secondaryPane, false)}
				</div>
			</div>
		</div>
	)
}
