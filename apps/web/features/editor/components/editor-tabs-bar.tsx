import type { EditorTab } from '../tabs'
import { NOTE_TAB_DRAG_TYPE } from '@/features/notes/constants'
import { cn } from '@skriuw/shared'
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger
} from '@skriuw/ui/context-menu'
import {
	Plus,
	X,
	ChevronLeft,
	ChevronRight,
	Copy,
	XCircle,
	Edit,
	Pin,
	Star,
	Trash2
} from 'lucide-react'
import { useState, useCallback } from 'react'

type props = {
	tabs: EditorTab[]
	activeNoteId: string | null
	onSelect: (noteId: string) => void
	onClose: (noteId: string) => void
	onCreateNote?: () => void
	onReorder?: (fromIndex: number, toIndex: number) => void
	onCloseOtherTabs?: (noteId: string) => void
	onCloseTabsToRight?: (noteId: string) => void
	onCloseTabsToLeft?: (noteId: string) => void
	onCloseAllTabs?: () => void
	onDuplicateTab?: (noteId: string) => void
	onMoveTabLeft?: (noteId: string) => void
	onMoveTabRight?: (noteId: string) => void
	onRenameNote?: (noteId: string) => void
	onDeleteNote?: (noteId: string) => void
	onPinNote?: (noteId: string, pinned: boolean) => void
	onFavoriteNote?: (noteId: string, favorite: boolean) => void
	getNoteData?: (noteId: string) => { pinned?: boolean; favorite?: boolean } | null
	dragSourcePaneId?: string | null
}

export function EditorTabsBar({
	tabs,
	activeNoteId,
	onSelect,
	onClose,
	onCreateNote,
	onReorder,
	onCloseOtherTabs,
	onCloseTabsToRight,
	onCloseTabsToLeft,
	onCloseAllTabs,
	onDuplicateTab,
	onMoveTabLeft,
	onMoveTabRight,
	onRenameNote,
	onDeleteNote,
	onPinNote,
	onFavoriteNote,
	getNoteData,
	dragSourcePaneId = null
}: props) {
	const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

	const handleDragStart = useCallback(
		(e: React.DragEvent, index: number) => {
			// Only allow dragging if not clicking on a button
			const target = e.target as HTMLElement
			if (target.tagName === 'BUTTON' || target.closest('button')) {
				e.preventDefault()
				return
			}
			setDraggedIndex(index)
			e.dataTransfer.effectAllowed = 'move'
			e.dataTransfer.setData('text/plain', tabs[index]?.noteId || '') // Required for Firefox
			e.dataTransfer.setData('application/x-skriuw-note-id', tabs[index]?.noteId || '')

			const tab = tabs[index]
			if (tab) {
				e.dataTransfer.setData(
					NOTE_TAB_DRAG_TYPE,
					JSON.stringify({
						noteId: tab.noteId,
						sourcePaneId: dragSourcePaneId
					})
				)
			}
		},
		[tabs, dragSourcePaneId]
	)

	const handleDragOver = useCallback(
		(e: React.DragEvent, index: number) => {
			e.preventDefault()
			if (draggedIndex !== null && draggedIndex !== index) {
				setDragOverIndex(index)
			}
		},
		[draggedIndex]
	)

	const handleDragLeave = useCallback(() => {
		setDragOverIndex(null)
	}, [])

	const handleDrop = useCallback(
		(e: React.DragEvent, dropIndex: number) => {
			e.preventDefault()
			if (draggedIndex !== null && draggedIndex !== dropIndex && onReorder) {
				onReorder(draggedIndex, dropIndex)
			}
			setDraggedIndex(null)
			setDragOverIndex(null)
		},
		[draggedIndex, onReorder]
	)

	const handleDragEnd = useCallback(() => {
		setDraggedIndex(null)
		setDragOverIndex(null)
	}, [])

	// Memoized handlers for tab actions
	const handleTabSelect = useCallback(
		(noteId: string) => {
			onSelect(noteId)
		},
		[onSelect]
	)

	const handleTabClose = useCallback(
		(noteId: string) => {
			onClose(noteId)
		},
		[onClose]
	)

	const handleMouseDownStop = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
	}, [])

	const handleDuplicateTab = useCallback(
		(noteId: string) => {
			onDuplicateTab?.(noteId)
		},
		[onDuplicateTab]
	)

	const handleRenameNote = useCallback(
		(noteId: string) => {
			onRenameNote?.(noteId)
		},
		[onRenameNote]
	)

	const handlePinNote = useCallback(
		(noteId: string, pinned: boolean) => {
			onPinNote?.(noteId, pinned)
		},
		[onPinNote]
	)

	const handleFavoriteNote = useCallback(
		(noteId: string, favorite: boolean) => {
			onFavoriteNote?.(noteId, favorite)
		},
		[onFavoriteNote]
	)

	const handleMoveTabLeft = useCallback(
		(noteId: string) => {
			onMoveTabLeft?.(noteId)
		},
		[onMoveTabLeft]
	)

	const handleMoveTabRight = useCallback(
		(noteId: string) => {
			onMoveTabRight?.(noteId)
		},
		[onMoveTabRight]
	)

	const handleCloseTabsToLeft = useCallback(
		(noteId: string) => {
			onCloseTabsToLeft?.(noteId)
		},
		[onCloseTabsToLeft]
	)

	const handleCloseTabsToRight = useCallback(
		(noteId: string) => {
			onCloseTabsToRight?.(noteId)
		},
		[onCloseTabsToRight]
	)

	const handleCloseOtherTabs = useCallback(
		(noteId: string) => {
			onCloseOtherTabs?.(noteId)
		},
		[onCloseOtherTabs]
	)

	const handleCloseAllTabs = useCallback(() => {
		onCloseAllTabs?.()
	}, [onCloseAllTabs])

	const handleDeleteAndClose = useCallback(
		(noteId: string) => {
			onDeleteNote?.(noteId)
			onClose(noteId)
		},
		[onDeleteNote, onClose]
	)

	return (
		<div className='border-b border-border/70 bg-muted/40 backdrop-blur-sm h-10'>
			<div
				className='skriuw-tabs-scroll flex items-stretch gap-0 overflow-x-auto px-0 h-full'
				role='tablist'
				aria-label='Open notes'
				style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
			>
				{tabs.map((tab, index) => {
					const isActive = tab.noteId === activeNoteId
					const isDragging = draggedIndex === index
					const isDragOver = dragOverIndex === index
					const hasTabsToRight = index < tabs.length - 1
					const hasTabsToLeft = index > 0
					const hasOtherTabs = tabs.length > 1
					const canMoveLeft = hasTabsToLeft && onMoveTabLeft
					const canMoveRight = hasTabsToRight && onMoveTabRight
					const noteData = getNoteData ? getNoteData(tab.noteId) : null
					const isPinned = noteData?.pinned ?? false
					const isFavorite = noteData?.favorite ?? false

					// Create memoized handlers specific to this tab
					const handleSelectTab = () => handleTabSelect(tab.noteId)
					const handleCloseTab = () => handleTabClose(tab.noteId)
					const handleDuplicate = () => handleDuplicateTab(tab.noteId)
					const handleRename = () => handleRenameNote(tab.noteId)
					const handlePin = () => handlePinNote(tab.noteId, !isPinned)
					const handleFavorite = () => handleFavoriteNote(tab.noteId, !isFavorite)
					const handleMoveLeft = () => handleMoveTabLeft(tab.noteId)
					const handleMoveRight = () => handleMoveTabRight(tab.noteId)
					const handleCloseLeft = () => handleCloseTabsToLeft(tab.noteId)
					const handleCloseRight = () => handleCloseTabsToRight(tab.noteId)
					const handleCloseOther = () => handleCloseOtherTabs(tab.noteId)
					const handleDeleteClose = () => handleDeleteAndClose(tab.noteId)

					return (
						<ContextMenu key={tab.noteId}>
							<ContextMenuTrigger asChild>
								<div
									role='tab'
									aria-selected={isActive}
									draggable={!!onReorder}
									onDragStart={(e) => handleDragStart(e, index)}
									onDragOver={(e) => handleDragOver(e, index)}
									onDragLeave={handleDragLeave}
									onDrop={(e) => handleDrop(e, index)}
									onDragEnd={handleDragEnd}
									className={cn(
										'group flex min-w-[140px] max-w-[220px] items-center gap-2 px-3 text-xs transition-colors h-full cursor-move',
										isActive
											? 'bg-background text-foreground shadow-sm'
											: 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
										isDragging && 'opacity-50',
										isDragOver && 'border-l-2 border-l-primary'
									)}
								>
									<button
										type='button'
										className='flex-1 truncate text-left cursor-pointer'
										onClick={handleSelectTab}
										onMouseDown={handleMouseDownStop}
										draggable={false}
									>
										{tab.title}
									</button>
									<button
										type='button'
										className='shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer'
										aria-label={`Close ${tab.title}`}
										onClick={handleCloseTab}
										onMouseDown={handleMouseDownStop}
										draggable={false}
									>
										<X className='h-3.5 w-3.5' />
									</button>
								</div>
							</ContextMenuTrigger>
							<ContextMenuContent className='w-56'>
								{onDuplicateTab && (
									<ContextMenuItem onClick={handleDuplicate} className='text-xs'>
										<Copy className='w-4 h-4 mr-2' />
										Duplicate tab
									</ContextMenuItem>
								)}
								{(onDuplicateTab || onRenameNote) && <ContextMenuSeparator />}
								{onRenameNote && (
									<ContextMenuItem onClick={handleRename} className='text-xs'>
										<Edit className='w-4 h-4 mr-2' />
										Rename
									</ContextMenuItem>
								)}
								<ContextMenuSeparator />
								{onPinNote && (
									<ContextMenuItem onClick={handlePin} className='text-xs'>
										<Pin className='w-4 h-4 mr-2' />
										{isPinned ? 'Unpin from top' : 'Pin to top'}
									</ContextMenuItem>
								)}
								{onFavoriteNote && (
									<ContextMenuItem onClick={handleFavorite} className='text-xs'>
										<Star
											className={cn(
												'w-4 h-4 mr-2',
												isFavorite && 'fill-yellow-400 text-yellow-400'
											)}
										/>
										{isFavorite ? 'Remove from favorites' : 'Add to favorites'}
									</ContextMenuItem>
								)}
								{(onPinNote || onFavoriteNote) && <ContextMenuSeparator />}
								{canMoveLeft && (
									<ContextMenuItem onClick={handleMoveLeft} className='text-xs'>
										<ChevronLeft className='w-4 h-4 mr-2' />
										Move left
									</ContextMenuItem>
								)}
								{canMoveRight && (
									<ContextMenuItem onClick={handleMoveRight} className='text-xs'>
										<ChevronRight className='w-4 h-4 mr-2' />
										Move right
									</ContextMenuItem>
								)}
								{(canMoveLeft || canMoveRight) && <ContextMenuSeparator />}
								<ContextMenuItem onClick={handleCloseTab} className='text-xs'>
									<X className='w-4 h-4 mr-2' />
									Close tab
								</ContextMenuItem>
								{hasTabsToLeft && onCloseTabsToLeft && (
									<ContextMenuItem onClick={handleCloseLeft} className='text-xs'>
										Close tabs to the left
									</ContextMenuItem>
								)}
								{hasTabsToRight && onCloseTabsToRight && (
									<ContextMenuItem onClick={handleCloseRight} className='text-xs'>
										Close tabs to the right
									</ContextMenuItem>
								)}
								{hasOtherTabs && onCloseOtherTabs && (
									<ContextMenuItem onClick={handleCloseOther} className='text-xs'>
										Close other tabs
									</ContextMenuItem>
								)}
								{onCloseAllTabs && tabs.length > 1 && (
									<>
										<ContextMenuSeparator />
										<ContextMenuItem
											onClick={handleCloseAllTabs}
											className='text-xs text-destructive focus:text-destructive'
										>
											<XCircle className='w-4 h-4 mr-2' />
											Close all tabs
										</ContextMenuItem>
									</>
								)}
								{onDeleteNote && (
									<>
										<ContextMenuSeparator />
										<ContextMenuItem
											onClick={handleDeleteClose}
											className='text-xs text-destructive focus:text-destructive'
										>
											<Trash2 className='w-4 h-4 mr-2' />
											Delete note
										</ContextMenuItem>
									</>
								)}
							</ContextMenuContent>
						</ContextMenu>
					)
				})}
				{onCreateNote && (
					<button
						type='button'
						className='flex items-center gap-2 px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors h-full'
						onClick={onCreateNote}
						aria-label='Create new note'
					>
						<Plus className='h-3.5 w-3.5' />
						<span>New</span>
					</button>
				)}
			</div>
			<style>{`
        .skriuw-tabs-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>
		</div>
	)
}
