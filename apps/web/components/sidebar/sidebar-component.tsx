'use client'

import { Edit, FilePlus, FolderOpen, Pin, Star, Trash2, ChevronRight, ChevronDown, Folder } from 'lucide-react'
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type TouchEvent
} from 'react'
import { useRouter } from 'next/navigation'

import {
	useMediaQuery,
	MOBILE_BREAKPOINT
} from '@skriuw/shared/client'

import { IconButton, NotesIcon, UIPlaygroundIcon } from '@skriuw/ui/icons'
import {
	useConfirmationPopover,
	type ConfirmationPopoverOptions
} from '@skriuw/ui/confirmation-popover'

import { cn } from '@skriuw/shared'

import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { blocksToText } from '@/features/notes/utils/blocks-to-text'
import { useSettings } from '@/features/settings'
import { findItemById, isDescendant } from '@/features/notes/utils/tree-helpers'
import { useShortcut } from '../../features/shortcuts'
import { useContextMenuState } from '../../features/shortcuts/context-menu-context'
import { shortcutDefinitions } from '../../features/shortcuts/shortcut-definitions'

import { useSelectionStore } from '../../stores/selection-store'
import { useUIStore } from '../../stores/ui-store'
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger
} from '@skriuw/ui'

import { ActionBar } from '../action-bar'

import { SidebarEmptyState } from './sidebar-empty-state'

import { useMutationGuard } from '@/hooks/use-mutation-guard'
import { useSidebarContentType } from './use-sidebar-content-type'
import { TasksSidebarContent } from './tasks-sidebar-content'

import type { SidebarContentType } from './types'
import type { Folder as FolderType, Item } from '@/features/notes/types'
import type { Block } from '@blocknote/core'

const EXPANDED_FOLDERS_KEY = 'Skriuw_expanded_folders'

// Component to render folder options for moving
function MoveFolderMenu({
	currentFolderId,
	allItems,
	onMoveItem,
	isMobile,
	selectedIds,
	onClearSelection
}: {
	currentFolderId: string
	allItems: Item[]
	onMoveItem: (
		itemId: string,
		targetFolderId: string | null
	) => Promise<boolean>
	isMobile: boolean
	selectedIds?: string[]
	onClearSelection?: () => void
}) {
	const isBulkMove = selectedIds && selectedIds.length > 1

	const checkIsDescendant = useCallback(
		(folderId: string, ancestorIds: string[], items: Item[]): boolean => {
			return ancestorIds.some((ancestorId) =>
				isDescendant(items, ancestorId, folderId)
			)
		},
		[]
	)

	// Get available folders (excluding folders being moved and their descendants)
	const availableFolders = useMemo(() => {
		const folders: Item[] = []
		const idsToExclude = isBulkMove ? selectedIds! : [currentFolderId]
		// Only check descendants for folders, since notes can't have descendants
		const folderIdsToExclude = idsToExclude.filter((id) => {
			const item = findItemById(allItems, id)
			return item?.type === 'folder'
		})

		function collectFolders(itemList: Item[]) {
			for (const item of itemList) {
				if (
					item.type === 'folder' &&
					!idsToExclude.includes(item.id) &&
					!checkIsDescendant(item.id, folderIdsToExclude, allItems)
				) {
					folders.push(item)
					collectFolders(item.children || [])
				}
			}
		}

		collectFolders(allItems)
		return folders
	}, [allItems, currentFolderId, checkIsDescendant, isBulkMove, selectedIds])

	const handleMoveToRoot = useCallback(async () => {
		const idsToMove = isBulkMove ? selectedIds! : [currentFolderId]
		for (const id of idsToMove) {
			await onMoveItem(id, null)
		}
		if (isBulkMove && onClearSelection) {
			onClearSelection()
		}
	}, [currentFolderId, onMoveItem, isBulkMove, selectedIds, onClearSelection])

	const handleMoveToFolder = useCallback(
		async (targetFolderId: string) => {
			const idsToMove = isBulkMove ? selectedIds! : [currentFolderId]
			for (const id of idsToMove) {
				await onMoveItem(id, targetFolderId)
			}
			if (isBulkMove && onClearSelection) {
				onClearSelection()
			}
		},
		[currentFolderId, onMoveItem, isBulkMove, selectedIds, onClearSelection]
	)

	return (
		<>
			<ContextMenuItem
				onClick={handleMoveToRoot}
				className={cn(
					'text-xs min-h-[36px]',
					isMobile && 'text-sm h-12 px-4'
				)}
			>
				Root folder
			</ContextMenuItem>
			{availableFolders.length > 0 && <ContextMenuSeparator />}
			{availableFolders.map((folder) => (
				<ContextMenuItem
					key={folder.id}
					onClick={() => handleMoveToFolder(folder.id)}
					className={cn(
						'text-xs min-h-[36px]',
						isMobile && 'text-sm h-12 px-4'
					)}
				>
					<FolderOpen
						className={cn(
							'w-3.5 h-3.5 mr-2',
							isMobile && 'w-5 h-5'
						)}
					/>
					{folder.name}
				</ContextMenuItem>
			))}
		</>
	)
}



type RulerProps = {
	enabled?: boolean
	color?: string
	style?: 'solid' | 'dashed'
	opacity?: number
}

type props = {
	activeNoteId?: string
	contentType?: SidebarContentType
	customContent?: React.ReactNode
	ruler?: RulerProps
	openTabIds?: string[]
}

// Helper function to format shortcut keys for display
// Prefers single-key shortcuts for context menu display
const formatShortcut = (
	shortcutId: keyof typeof shortcutDefinitions
): string | null => {
	const definition = shortcutDefinitions[shortcutId]
	if (!definition || !definition.enabled) return null

	// Prefer single-key shortcuts (no modifiers) for context menu display
	const singleKeyCombo = definition.keys.find((combo) => combo.length === 1)
	const keys = singleKeyCombo || definition.keys[0]
	if (!keys) return null

	return keys
		.map((key) => {
			if (key === 'Meta') return '⌘'
			if (key === 'Ctrl') return 'Ctrl'
			if (key === 'Alt') return 'Alt'
			if (key === 'Shift') return 'Shift'
			if (key === 'Backspace') return '⌫'
			if (key === 'Delete') return 'Del'
			if (key === 'Enter') return '↵'
			if (key === 'Escape') return 'Esc'
			if (key === 'Tab') return 'Tab'
			if (key === 'Space') return 'Space'
			if (key === 'ArrowUp') return '↑'
			if (key === 'ArrowDown') return '↓'
			if (key === 'ArrowLeft') return '←'
			if (key === 'ArrowRight') return '→'
			// For single character keys, return uppercase
			if (key.length === 1) return key.toUpperCase()
			return key
		})
		.join('+')
}

function FileTreeItem({
	item,
	level = 0,
	activeNoteId,
	expandedFolders,
	selectedFolderId,
	onToggleFolder,
	onNavigateNote,
	onRename,
	onDelete,
	onCreateNote,
	onCreateFolder,
	onDragStart,
	onDragOver,
	onDrop,
	onSelectFolder,
	onContextMenuOpenChange,
	onPinItem,
	onFavoriteNote,
	onMoveItem,
	allItems,
	ruler,
	openTabIds,
	allVisibleItemIds,
	showConfirm,
	isLast = false,
	parentGuides = []
}: {
	item: Item
	level?: number
	isLast?: boolean
	parentGuides?: boolean[]
	activeNoteId?: string
	expandedFolders: Set<string>
	selectedFolderId: string | null
	onToggleFolder: (id: string) => void
	onNavigateNote: (id: string) => void
	onRename: (id: string, newName: string) => void
	onDelete: (id: string) => void
	onCreateNote: (parentId?: string) => void
	onCreateFolder: (parentId?: string) => void
	onDragStart: (item: Item, e: React.DragEvent) => void
	onDragOver: (e: React.DragEvent) => void
	onDrop: (targetId: string, e: React.DragEvent) => void
	onSelectFolder: (id: string | null) => void
	onContextMenuOpenChange?: (
		open: boolean,
		itemId: string,
		handlers: {
			onDelete: (id: string) => void
			onCreateNote: (id: string) => void
			onCreateFolder: (id: string) => void
			onRename: (id: string) => void
			onPinItem: (id: string) => void
		}
	) => void
	onPinItem: (
		itemId: string,
		itemType: 'note' | 'folder',
		pinned: boolean
	) => void
	onFavoriteNote: (noteId: string, favorite: boolean) => void
	onMoveItem: (
		itemId: string,
		targetFolderId: string | null
	) => Promise<boolean>
	allItems: Item[]
	ruler?: RulerProps
	openTabIds?: string[]
	allVisibleItemIds?: string[]
	showConfirm?: (options: ConfirmationPopoverOptions) => void
}) {
	const [isRenaming, setIsRenaming] = useState(false)
	const [renameValue, setRenameValue] = useState(item.name)
	const [isHovering, setIsHovering] = useState(false)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
	const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
	const isDraggingRef = useRef(false)
	const dragTargetRef = useRef<string | null>(null)
	const touchDragStartTimeRef = useRef<number | null>(null)
	const isTogglingFolderRef = useRef(false)
	const isMobile = useMediaQuery(MOBILE_BREAKPOINT)
	const isFolder = item.type === 'folder'
	const isExpanded = expandedFolders.has(item.id)
	const isActive = !isFolder && activeNoteId === item.id
	const isFolderSelected = isFolder && selectedFolderId === item.id
	const hasOpenTab = !isFolder && openTabIds?.includes(item.id)
	const hasChildren =
		isFolder && item.type === 'folder' && item.children.length > 0

	// Selection store
	const {
		isSelected,
		toggleSelection,
		selectItem,
		clearSelection,
		getSelectedCount,
		getSelectedIds,
		setAnchor,
		selectRange,
		anchorId,
		lastSelectedId
	} = useSelectionStore()
	const isItemSelected = isSelected(item.id)

	useEffect(() => {
		if (isRenaming && inputRef.current) {
			// Use requestAnimationFrame for better focus handling
			// Double RAF ensures the input is fully rendered and context menu is closed
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					if (inputRef.current) {
						inputRef.current.focus()
						inputRef.current.select()
						// Ensure the input is scrolled into view
						inputRef.current.scrollIntoView({
							behavior: 'smooth',
							block: 'nearest',
							inline: 'nearest'
						})
					}
				})
			})
		}
	}, [isRenaming])

	// Cleanup timeouts on unmount
	useEffect(() => {
		return () => {
			if (clickTimeoutRef.current) {
				clearTimeout(clickTimeoutRef.current)
			}
			if (longPressTimerRef.current) {
				clearTimeout(longPressTimerRef.current)
			}
		}
	}, [])

	const handleDoubleClick = useCallback(() => {
		// Clear any pending single click
		if (clickTimeoutRef.current) {
			clearTimeout(clickTimeoutRef.current)
			clickTimeoutRef.current = null
		}
		setIsRenaming(true)
	}, [])

	function handleNameClick(e: React.MouseEvent) {
		if (isRenaming) return

		// Stop propagation so clicking name doesn't trigger folder toggle
		e.stopPropagation()

		// Handle Shift+Click for range selection (before Ctrl/Cmd)
		if (
			e.shiftKey &&
			!e.ctrlKey &&
			!e.metaKey &&
			allVisibleItemIds &&
			allVisibleItemIds.length > 0
		) {
			e.preventDefault()
			const effectiveAnchor = anchorId || lastSelectedId
			if (effectiveAnchor && effectiveAnchor !== item.id) {
				// Select range from anchor/lastSelected to this item
				selectRange(effectiveAnchor, item.id, allVisibleItemIds)
			} else {
				// Set this as anchor if no anchor exists
				setAnchor(item.id)
			}
			return
		}

		// Handle Ctrl/Cmd+Click for multi-selection
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault()
			toggleSelection(item.id)
			// Set anchor if this is first selection
			if (!anchorId && !isItemSelected) {
				setAnchor(item.id)
			}
			return
		}

		// Use a small delay to distinguish between single and double click
		if (clickTimeoutRef.current) {
			clearTimeout(clickTimeoutRef.current)
		}

		clickTimeoutRef.current = setTimeout(() => {
			if (isFolder) {
				// Toggle folder when clicking name
				if (hasChildren) {
					onToggleFolder(item.id)
				}
				onSelectFolder(item.id)
			} else {
				onNavigateNote(item.id)
				onSelectFolder(null) // Clear folder selection when clicking a note
			}
			// Set anchor on regular click (this clears previous selection and selects only this item)
			setAnchor(item.id)
			clickTimeoutRef.current = null
		}, 200)
	}

	function handleRowClick(e: React.MouseEvent) {
		// Don't handle if renaming
		if (isRenaming) return

		// Don't handle if clicking on the rename input
		if ((e.target as HTMLElement).tagName === 'INPUT') {
			e.preventDefault()
			e.stopPropagation()
			return
		}

		// Don't handle if we just finished a drag operation on mobile
		if (isMobile && isDraggingRef.current) {
			e.preventDefault()
			e.stopPropagation()
			return
		}

		// Handle Shift+Click for range selection (before Ctrl/Cmd)
		if (
			e.shiftKey &&
			!e.ctrlKey &&
			!e.metaKey &&
			allVisibleItemIds &&
			allVisibleItemIds.length > 0
		) {
			e.preventDefault()
			e.stopPropagation()
			const effectiveAnchor = anchorId || lastSelectedId
			if (effectiveAnchor && effectiveAnchor !== item.id) {
				// Select range from anchor/lastSelected to this item
				selectRange(effectiveAnchor, item.id, allVisibleItemIds)
			} else {
				// Set this as anchor if no anchor exists
				setAnchor(item.id)
			}
			return
		}

		// Handle Ctrl/Cmd+Click for multi-selection (except on input fields)
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault()
			e.stopPropagation()
			toggleSelection(item.id)
			// Set anchor if this is first selection
			if (!anchorId && !isItemSelected) {
				setAnchor(item.id)
			}
			return
		}

		// Clear any pending single click timeout to prevent it from firing
		if (clickTimeoutRef.current) {
			clearTimeout(clickTimeoutRef.current)
			clickTimeoutRef.current = null
		}

		const clickedElement = e.target as HTMLElement

		// Don't toggle if clicking on the rename input
		if (clickedElement.tagName === 'INPUT') {
			return
		}

		// Don't handle if clicking on the name span (it has its own handler with double-click detection)
		if (clickedElement.closest('[data-item-name]')) {
			return
		}

		// Don't toggle if clicking on the icon (it has its own handler)
		if (
			clickedElement.closest('[data-folder-icon]') ||
			clickedElement.closest('svg[data-folder-icon]')
		) {
			return
		}

		// Don't select if clicking on the folder icon area (check if the click originated from the icon)
		if (
			isFolder &&
			(e.target as HTMLElement).closest('[data-folder-icon]')
		) {
			return
		}

		// Don't select if we just toggled the folder (prevents selection when clicking folder icon)
		if (isTogglingFolderRef.current) {
			// Reset the flag since we've checked it
			isTogglingFolderRef.current = false
			return
		}

		if (isFolder) {
			// Toggle folder when clicking on the button, but only if it has children
			if (hasChildren) {
				onToggleFolder(item.id)
			}
			onSelectFolder(item.id)
		} else {
			// Navigate to note
			onNavigateNote(item.id)
			onSelectFolder(null)
		}
		// Set anchor on regular click
		setAnchor(item.id)
	}

	const handleRenameComplete = useCallback(() => {
		if (renameValue.trim()) {
			onRename(item.id, renameValue.trim())
		} else {
			setRenameValue(item.name)
		}
		setIsRenaming(false)
	}, [renameValue, item.id, item.name, onRename])

	function handleFolderToggle(e: React.MouseEvent) {
		e.stopPropagation()
		e.preventDefault()
		if (!hasChildren) return
		// Mark that we're toggling to prevent selection in handleRowClick
		isTogglingFolderRef.current = true
		onToggleFolder(item.id)
		onSelectFolder(item.id)
		// Reset the flag in the next event loop cycle
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				isTogglingFolderRef.current = false
			})
		})
	}

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLButtonElement>) => {
			if (isRenaming) {
				return
			}

			// Handle Ctrl/Cmd+Click for multi-selection
			if (e.ctrlKey || e.metaKey) {
				return // Let the click handlers handle this
			}

			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault()
				if (isFolder) {
					if (hasChildren) {
						onToggleFolder(item.id)
					}
				} else {
					onNavigateNote(item.id)
				}
			}

			if (isFolder) {
				if (e.key === 'ArrowRight' && !isExpanded && hasChildren) {
					e.preventDefault()
					onToggleFolder(item.id)
				}
				if (e.key === 'ArrowLeft' && isExpanded && hasChildren) {
					e.preventDefault()
					onToggleFolder(item.id)
				}
			}
		},
		[
			isRenaming,
			isFolder,
			onToggleFolder,
			item.id,
			onNavigateNote,
			isExpanded,
			hasChildren
		]
	)

	const handleContextMenuOpenChange = useCallback(
		(open: boolean) => {
			if (onContextMenuOpenChange) {
				onContextMenuOpenChange(open, item.id, {
					onDelete,
					onCreateNote,
					onCreateFolder,
					onRename: (id: string) => {
						setIsRenaming(true)
						// Ensure input gets focus
						setTimeout(() => {
							if (inputRef.current) {
								inputRef.current.focus()
								inputRef.current.select()
							}
						}, 50)
					},
					onPinItem: (id: string) => {
						onPinItem(id, item.type, !item.pinned)
					}
				})
			}
		},
		[
			item.id,
			item.type,
			item.pinned,
			onDelete,
			onCreateNote,
			onCreateFolder,
			onRename,
			onPinItem,
			onContextMenuOpenChange
		]
	)

	// Helper to find item by ID
	const findItem = useCallback(
		(id: string): Item | undefined => {
			return findItemById(allItems, id)
		},
		[allItems]
	)

	// Check if multiple items are selected for context menu
	const hasMultipleSelections = getSelectedCount() > 1
	const isInCurrentSelection = isItemSelected || hasMultipleSelections

	// Check if there are notes in the selected items (for bulk favorite operations)
	const hasNotesInSelection = useMemo(() => {
		if (!hasMultipleSelections) return false
		const selectedIds = getSelectedIds()
		return selectedIds.some((id) => {
			const item = findItem(id)
			return item?.type === 'note'
		})
	}, [hasMultipleSelections, getSelectedIds, findItem])

	// Bulk favorite handlers
	const handleBulkFavorite = useCallback(async () => {
		const selectedIds = getSelectedIds()
		for (const id of selectedIds) {
			try {
				const item = findItem(id)
				// Only favorite notes, skip folders
				if (!item || item.type !== 'note') {
					continue
				}
				await onFavoriteNote(id, true)
			} catch (error) {
				console.error(`Failed to favorite item ${id}:`, error)
			}
		}
		clearSelection()
	}, [getSelectedIds, findItem, onFavoriteNote, clearSelection])

	const handleBulkUnfavorite = useCallback(async () => {
		const selectedIds = getSelectedIds()
		for (const id of selectedIds) {
			try {
				const item = findItem(id)
				// Only unfavorite notes, skip folders
				if (!item || item.type !== 'note') {
					continue
				}
				await onFavoriteNote(id, false)
			} catch (error) {
				console.error(`Failed to unfavorite item ${id}:`, error)
			}
		}
		clearSelection()
	}, [getSelectedIds, findItem, onFavoriteNote, clearSelection])

	// Long-press handler for mobile
	const handleTouchStart = useCallback(
		(e: TouchEvent<HTMLButtonElement>) => {
			if (!isMobile) return

			const touch = e.touches[0]
			touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
			touchDragStartTimeRef.current = Date.now()
			isDraggingRef.current = false
			dragTargetRef.current = null

			// Start long-press timer (500ms)
			longPressTimerRef.current = setTimeout(() => {
				// Prevent default context menu
				e.preventDefault()
				// Open context menu by dispatching a contextmenu event
				const button = e.currentTarget
				const contextMenuEvent = new MouseEvent('contextmenu', {
					bubbles: true,
					cancelable: true,
					clientX: touch.clientX,
					clientY: touch.clientY
				})
				button.dispatchEvent(contextMenuEvent)
				// Haptic feedback if available
				if (navigator.vibrate) {
					navigator.vibrate(50)
				}
			}, 500)
		},
		[isMobile]
	)

	// Additional memoized handlers
	const handleFolderIconMouseEnter = useCallback(() => {
		setIsHovering(true)
	}, [])

	const handleFolderIconMouseLeave = useCallback(() => {
		setIsHovering(false)
	}, [])

	const handleRenameInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		setRenameValue(e.target.value)
		e.stopPropagation()
	}, [])

	const handleRenameInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			e.stopPropagation()
			handleRenameComplete()
		} else if (e.key === 'Escape') {
			e.preventDefault()
			e.stopPropagation()
			setRenameValue(item.name)
			setIsRenaming(false)
		} else {
			// For all other keys, stop propagation but allow typing
			e.stopPropagation()
		}
	}, [item.name, handleRenameComplete, setRenameValue, setIsRenaming])

	const handleRenameInputClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
		e.preventDefault()
	}, [])

	const handleRenameInputMouseDown = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
		e.preventDefault()
	}, [])

	const handleRenameInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
		e.stopPropagation()
		// Select all text when focused
		e.currentTarget.select()
	}, [])

	const handleRenameInputBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
		// Delay blur handling to prevent premature completion
		// when context menu closes or other UI interactions occur
		setTimeout(() => {
			if (
				inputRef.current &&
				document.activeElement !== inputRef.current
			) {
				handleRenameComplete()
			}
		}, 200)
	}, [handleRenameComplete, inputRef])

	const handleNameDoubleClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
		handleDoubleClick()
	}, [handleDoubleClick])

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		if (isMobile) {
			e.preventDefault()
		}
	}, [isMobile])

	const handleDragStartElement = useCallback((e: React.DragEvent) => {
		if (isMobile) {
			// On mobile, only allow drag if we've been holding for a bit
			if (
				!touchDragStartTimeRef.current ||
				Date.now() - touchDragStartTimeRef.current < 200
			) {
				e.preventDefault()
				return
			}
		}
		onDragStart(item, e)
	}, [isMobile, onDragStart, item])

	const handleDropElement = useCallback((e: React.DragEvent) => {
		onDrop(item.id, e)
	}, [onDrop, item.id])

	const handleTouchMove = useCallback(
		(e: TouchEvent<HTMLButtonElement>) => {
			if (!isMobile || !touchStartPosRef.current) return

			const touch = e.touches[0]
			const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x)
			const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y)

			// Cancel long-press if user moved more than 10px (scrolling/dragging)
			if (deltaX > 10 || deltaY > 10) {
				if (longPressTimerRef.current) {
					clearTimeout(longPressTimerRef.current)
					longPressTimerRef.current = null
				}

				// If moved vertically more than horizontally and moved enough, mark as dragging
				// This prevents click navigation from firing
				if (deltaY > 15) {
					isDraggingRef.current = true
					e.preventDefault()
					e.stopPropagation()
				} else {
					touchStartPosRef.current = null
				}
			}
		},
		[isMobile]
	)

	const handleTouchEnd = useCallback((e: TouchEvent<HTMLButtonElement>) => {
		if (longPressTimerRef.current) {
			clearTimeout(longPressTimerRef.current)
			longPressTimerRef.current = null
		}

		// If we detected dragging, prevent click from firing
		if (isDraggingRef.current) {
			e.preventDefault()
			e.stopPropagation()
			// Clear the click timeout to prevent navigation
			if (clickTimeoutRef.current) {
				clearTimeout(clickTimeoutRef.current)
				clickTimeoutRef.current = null
			}
			isDraggingRef.current = false
		}

		touchStartPosRef.current = null
		touchDragStartTimeRef.current = null
	}, [])

	const handleCreateNoteFromContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			onCreateNote(isFolder ? item.id : undefined)
		},
		[onCreateNote, isFolder, item.id]
	)

	const handleCreateFolderFromContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			onCreateFolder(item.id)
		},
		[onCreateFolder, item.id]
	)

	const handleRenameFromContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			setIsRenaming(true)
			// Close context menu after a small delay to allow state update
			setTimeout(() => {
				if (inputRef.current) {
					inputRef.current.focus()
					inputRef.current.select()
				}
			}, 50)
		},
		[setIsRenaming, inputRef]
	)

	const handlePinUnpinFromContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			onPinItem(item.id, item.type, !item.pinned)
		},
		[onPinItem, item.id, item.type, item.pinned]
	)

	const handleBulkFavoriteFromContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			handleBulkFavorite()
		},
		[handleBulkFavorite]
	)

	const handleBulkUnfavoriteFromContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			handleBulkUnfavorite()
		},
		[handleBulkUnfavorite]
	)

	const handleFavoriteToggleFromContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			if (item.type === 'note') {
				onFavoriteNote(item.id, !item.favorite)
			}
		},
		[onFavoriteNote, item]
	)

	const handleDeleteFromContextMenu = useCallback(
		async (e: React.MouseEvent) => {
			const selectedCount = getSelectedCount()
			if (selectedCount > 1) {
				const selectedIds = [...getSelectedIds()]
				clearSelection()
				await Promise.all(selectedIds.map((id) => onDelete(id)))
			} else {
				onDelete(item.id)
			}
		},
		[getSelectedCount, getSelectedIds, onDelete, clearSelection, item.id]
	)

	// Recursively count all items in a folder (including nested folders and their children)
	function countAllItems(folder: FolderType): number {
		let count = 0
		for (const child of folder.children) {
			count += 1 // Count the child itself
			if (child.type === 'folder') {
				count += countAllItems(child) // Recursively count nested items
			}
		}
		return count
	}

	const childCount =
		isFolder && item.type === 'folder'
			? item.name === 'To Do'
				? countAllItems(item)
				: item.children.length
			: 0

	return (
		<>
			<ContextMenu onOpenChange={handleContextMenuOpenChange}>
				<ContextMenuTrigger asChild>
					<div className="w-full">
						<div className="w-full h-full">
							<button
								type="button"
								onClick={handleRowClick}
								onTouchStart={handleTouchStart}
								onTouchMove={handleTouchMove}
								onTouchEnd={handleTouchEnd}
								onTouchCancel={handleTouchEnd}
								className={cn(
									'font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent rounded-md px-3 text-xs active:scale-[98%] h-7 w-full fill-muted-foreground hover:fill-foreground transition-all flex items-center justify-between touch-manipulation relative',
									isActive || isItemSelected
										? 'bg-accent text-foreground'
										: 'text-secondary-foreground/80 hover:text-foreground'
								)}
								style={{
									paddingLeft: `${0.75 + level * 0.75}rem`
								}}
								draggable={true}
								onDragStart={handleDragStartElement}
								onDragOver={onDragOver}
								onDrop={handleDropElement}
								onKeyDown={handleKeyDown}
								tabIndex={0}
								role="treeitem"
								aria-expanded={
									isFolder ? isExpanded : undefined
								}
								aria-selected={isItemSelected}
							>
								{/* Tree Hierarchy Guides */}
								{ruler?.enabled && (
									<>
										{/* Ancestor Vertical Lines */}
										{parentGuides?.map((hasLine, i) => (
											hasLine && (
												<div
													key={i}
													className="absolute top-0 bottom-0 border-l border-muted-foreground/30 pointer-events-none"
													style={{
														left: `calc(0.75rem + ${i * 0.75}rem + 9px - 0.5px)`,
													}}
												/>
											)
										))}
										{/* Current Item Connector */}
										{level > 0 && (
											<>
												{/* Vertical segment from parent */}
												<div
													className={cn(
														"absolute border-l border-muted-foreground/30 pointer-events-none",
														isLast ? "top-0 h-1/2" : "top-0 h-full"
													)}
													style={{
														left: `calc(0.75rem + ${(level - 1) * 0.75}rem + 9px - 0.5px)`,
													}}
												/>
												{/* Horizontal curve/segment to item */}
												<div
													className={cn(
														"absolute top-1/2 h-px w-[12px] border-t border-muted-foreground/30 pointer-events-none",
														isLast && "rounded-bl-lg" // Optional: if we used borders for curve, but here we just use lines. 
														// Actually, for a rounded curve, we need a box with border-b and border-l.
														// Let's implement the Curve properly for Last Item.
													)}
													style={{ display: 'none' }} // Placeholder for the actual implementation below
												/>
												{/* Re-implementing with proper Curve for isLast */}
												{isLast ? (
													<div
														className="absolute top-0 w-[12px] h-[50%] border-l border-b border-muted-foreground/30 rounded-bl-lg pointer-events-none"
														style={{
															left: `calc(0.75rem + ${(level - 1) * 0.75}rem + 9px - 0.5px)`,
														}}
													/>
												) : (
													// For not last, use simple T-shape (Full vertical already drawn). 
													// Just draw the horizontal arm.
													<div
														className="absolute top-1/2 w-[12px] border-t border-muted-foreground/30 pointer-events-none"
														style={{
															left: `calc(0.75rem + ${(level - 1) * 0.75}rem + 9px - 0.5px)`,
														}}
													/>
												)}
											</>
										)}
									</>
								)}

								<div className="flex items-center w-[calc(100%-20px)] gap-2 min-w-0">
									{isFolder ? (
										<div
											data-folder-icon
											onClick={handleFolderToggle}
											className={cn(
												'shrink-0 cursor-default'
											)}
										>
											{isExpanded ? (
												<FolderOpen className="w-[18px] h-[18px] shrink-0" />
											) : (
												<Folder className="w-[18px] h-[18px] shrink-0" />
											)}
										</div>
									) : null}

									{isRenaming ? (
										<input
											ref={(el) => {
												inputRef.current = el
											}}
											type="text"
											value={renameValue}
											onChange={handleRenameInputChange}
											onBlur={handleRenameInputBlur}
											onKeyDown={handleRenameInputKeyDown}
											onClick={handleRenameInputClick}
											onMouseDown={handleRenameInputMouseDown}
											onFocus={handleRenameInputFocus}
											className="flex-1 min-w-0 bg-accent text-foreground text-xs px-1 py-0.5 rounded outline-none z-10 relative"
											autoFocus
										/>
									) : (
										<span
											onClick={handleNameClick}
											onDoubleClick={handleNameDoubleClick}
											className="text-xs truncate outline-none cursor-pointer flex items-center gap-1.5"
											title={item.name}
											data-item-name
										>
											{!isFolder && item.pinned && (
												<Pin className="w-3 h-3 text-muted-foreground/70 shrink-0" />
											)}
											{!isFolder && item.favorite && (
												<Star className="w-3 h-3 fill-yellow-400 text-yellow-400 shrink-0" />
											)}
											<span className="truncate">
												{item.name}
											</span>
										</span>
									)}
								</div>

								{isFolder && childCount > 0 && (
									<span className="text-[10px] text-muted-foreground/50 tabular-nums pr-1">
										{childCount}
									</span>
								)}
							</button>
						</div>
					</div>
				</ContextMenuTrigger>

				<ContextMenuContent
					className={cn(
						'w-44 max-w-[90vw]',
						isMobile &&
						'w-[280px] max-w-[calc(100vw-2rem)] rounded-lg shadow-2xl p-2'
					)}
				>
					<ContextMenuItem
						onClick={handleCreateNoteFromContextMenu}
						className={cn(
							'h-8 text-xs font-base min-h-[36px]',
							isMobile && 'h-12 text-sm px-4'
						)}
					>
						<FilePlus
							className={cn(
								'w-4 h-4 mr-3 shrink-0',
								isMobile && 'w-5 h-5'
							)}
						/>
						New note
						{!isMobile && (
							<ContextMenuShortcut>
								{formatShortcut('create-note') || '⌘N'}
							</ContextMenuShortcut>
						)}
					</ContextMenuItem>
					{isFolder && (
						<ContextMenuItem
							onClick={handleCreateFolderFromContextMenu}
							className={cn(
								'h-8 text-xs font-base min-h-[36px]',
								isMobile && 'h-12 text-sm px-4'
							)}
						>
							<FolderOpen
								className={cn(
									'w-4 h-4 mr-3 shrink-0',
									isMobile && 'w-5 h-5'
								)}
							/>
							New folder
							{!isMobile && (
								<ContextMenuShortcut>
									{formatShortcut('create-folder') || '⌘F'}
								</ContextMenuShortcut>
							)}
						</ContextMenuItem>
					)}
					<ContextMenuSeparator />
					<ContextMenuItem
						onClick={handleRenameFromContextMenu}
						className={cn(
							' text-xs font-base min-h-[36px]',
							isMobile && 'h-12 text-sm px-4'
						)}
					>
						<Edit
							className={cn(
								'w-4 h-4 mr-3 shrink-0',
								isMobile && 'w-5 h-5'
							)}
						/>
						Rename
						{!isMobile && (
							<ContextMenuShortcut>
								{formatShortcut('rename-item') || '⌘R'}
							</ContextMenuShortcut>
						)}
					</ContextMenuItem>
					<ContextMenuSeparator />
					{!isFolder && (
						<ContextMenuItem
							onClick={handlePinUnpinFromContextMenu}
							className={cn(
								'h-8 text-xs font-base min-h-[36px]',
								isMobile && 'h-12 text-sm px-4'
							)}
						>
							{item.pinned ? (
								<>
									<Pin
										className={cn(
											'w-4 h-4 mr-3 shrink-0',
											isMobile && 'w-5 h-5'
										)}
									/>
									Unpin from top
								</>
							) : (
								<>
									<Pin
										className={cn(
											'w-4 h-4 mr-3 shrink-0',
											isMobile && 'w-5 h-5'
										)}
									/>
									Pin to top
								</>
							)}
						</ContextMenuItem>
					)}
					{hasMultipleSelections && hasNotesInSelection ? (
						<>
							<ContextMenuItem
								onClick={handleBulkFavoriteFromContextMenu}
								className={cn(
									'h-8 text-xs font-base min-h-[36px]',
									isMobile && 'h-12 text-sm px-4'
								)}
							>
								<Star
									className={cn(
										'w-4 h-4 mr-3 shrink-0',
										isMobile && 'w-5 h-5'
									)}
								/>
								Add to favorites
							</ContextMenuItem>
							<ContextMenuItem
								onClick={handleBulkUnfavoriteFromContextMenu}
								className={cn(
									'h-8 text-xs font-base min-h-[36px]',
									isMobile && 'h-12 text-sm px-4'
								)}
							>
								<Star
									className={cn(
										'w-4 h-4 mr-3 shrink-0 fill-yellow-400 text-yellow-400',
										isMobile && 'w-5 h-5'
									)}
								/>
								Remove from favorites
							</ContextMenuItem>
						</>
					) : (
						!isFolder && (
							<ContextMenuItem
								onClick={handleFavoriteToggleFromContextMenu}
								className={cn(
									'h-8 text-xs font-base min-h-[36px]',
									isMobile && 'h-12 text-sm px-4'
								)}
							>
								{item.favorite ? (
									<>
										<Star
											className={cn(
												'w-4 h-4 mr-3 shrink-0 fill-yellow-400 text-yellow-400',
												isMobile && 'w-5 h-5'
											)}
										/>
										Remove from favorites
									</>
								) : (
									<>
										<Star
											className={cn(
												'w-4 h-4 mr-3 shrink-0',
												isMobile && 'w-5 h-5'
											)}
										/>
										Add to favorites
									</>
								)}
							</ContextMenuItem>
						)
					)}
					<ContextMenuSub>
						<ContextMenuSubTrigger
							className={cn(
								'h-7 text-xs font-base min-h-[36px]',
								isMobile && 'h-12 text-sm px-4'
							)}
						>
							<FolderOpen
								className={cn(
									'w-3.5 h-3.5 mr-2',
									isMobile && 'w-5 h-5'
								)}
							/>
							{getSelectedCount() > 1
								? `Move ${getSelectedCount()} items to...`
								: isFolder
									? 'Move folder to...'
									: 'Move to...'}
						</ContextMenuSubTrigger>
						<ContextMenuSubContent
							className={cn(
								isMobile &&
								'w-[280px] max-w-[calc(100vw-2rem)] rounded-lg shadow-2xl p-2'
							)}
						>
							<MoveFolderMenu
								currentFolderId={item.id}
								allItems={allItems}
								onMoveItem={onMoveItem}
								isMobile={isMobile}
								selectedIds={
									getSelectedCount() > 1
										? getSelectedIds()
										: undefined
								}
								onClearSelection={
									getSelectedCount() > 1
										? clearSelection
										: undefined
								}
							/>
						</ContextMenuSubContent>
					</ContextMenuSub>
					<ContextMenuSeparator />
					<ContextMenuItem
						onClick={handleDeleteFromContextMenu}
						className={cn(
							'h-8 text-xs font-base text-destructive focus:text-destructive min-h-[36px]',
							isMobile && 'h-12 text-sm px-4'
						)}
					>
						<Trash2
							className={cn(
								'w-4 h-4 mr-3 shrink-0',
								isMobile && 'w-5 h-5'
							)}
						/>
						{getSelectedCount() > 1
							? `Delete ${getSelectedCount()} items`
							: 'Delete'}
						{!isMobile && (
							<ContextMenuShortcut>
								{formatShortcut('delete-item') || 'Del'}
							</ContextMenuShortcut>
						)}
					</ContextMenuItem>
				</ContextMenuContent>

				{isFolder && isExpanded && item.type === 'folder' && (
					<>
						{/* Modern Hierarchy Guides - Recursive Children */}
						{item.children.map((child: any, index: number, arr: any[]) => (
							<FileTreeItem
								key={child.id}
								item={child}
								level={level + 1}
								isLast={index === arr.length - 1}
								parentGuides={[...(parentGuides || []), !isLast]}
								activeNoteId={activeNoteId}
								expandedFolders={expandedFolders}
								selectedFolderId={selectedFolderId}
								onToggleFolder={onToggleFolder}
								onNavigateNote={onNavigateNote}
								onRename={onRename}
								onDelete={onDelete}
								onCreateNote={onCreateNote}
								onCreateFolder={onCreateFolder}
								onDragStart={onDragStart}
								onDragOver={onDragOver}
								onDrop={onDrop}
								onSelectFolder={onSelectFolder}
								onContextMenuOpenChange={
									onContextMenuOpenChange
								}
								onPinItem={onPinItem}
								onFavoriteNote={onFavoriteNote}
								onMoveItem={onMoveItem}
								allItems={allItems}
								ruler={ruler}
								openTabIds={openTabIds}
								allVisibleItemIds={allVisibleItemIds}
								showConfirm={showConfirm}
							/>
						))}
					</>
				)}
			</ContextMenu>
		</>
	)
}

export function Sidebar({
	activeNoteId,
	contentType,
	customContent,
	ruler,
	openTabIds
}: props) {
	const router = useRouter()
	const detectedContentType = useSidebarContentType()
	const finalContentType = contentType || detectedContentType
	const isMobile = useMediaQuery(MOBILE_BREAKPOINT)

	// Access sidebar state
	const { isDesktopSidebarOpen, setMobileSidebarOpen } = useUIStore()

	// All hooks must be called before any conditional returns
	const {
		items,
		isInitialLoading,
		isRefreshing,
		createNote: originalCreateNote,
		createFolder: originalCreateFolder,
		renameItem: originalRenameItem,
		deleteItem: originalDeleteItem,
		moveItem: originalMoveItem,
		pinItem: originalPinItem,
		favoriteNote: originalFavoriteNote
	} = useNotesContext()
	const { guard } = useMutationGuard()
	const { getNoteUrl } = useNoteSlug(items)

	// Use original actions directly - useNotes handles guest user storage internally
	const createNote = originalCreateNote
	const createFolder = originalCreateFolder
	const renameItem = originalRenameItem
	const deleteItem = originalDeleteItem
	const moveItem = useCallback(
		async (itemId: string, targetFolderId: string | null): Promise<boolean> => {
			const result = await originalMoveItem(itemId, targetFolderId)
			return result != null
		},
		[originalMoveItem]
	)
	const pinItem = originalPinItem
	const favoriteNote = originalFavoriteNote

	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
		new Set()
	)
	const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
		null
	)
	const draggedItemRef = useRef<Item | null>(null)
	const [searchQuery, setSearchQuery] = useState('')
	const [isSearchOpen, setIsSearchOpen] = useState(false)
	const { contextMenuState, setContextMenuState } = useContextMenuState()
	const { getSetting } = useSettings()
	const searchInContent = getSetting('searchInContent') ?? false

	// Selection store
	const { selectAll, clearSelection, getSelectedCount, getSelectedIds } =
		useSelectionStore()

	// Confirmation popover for keyboard-triggered bulk delete
	const { showConfirm, ConfirmationPopover: SidebarConfirmationPopover } =
		useConfirmationPopover()

	// Wrap deleteItem to handle navigation when deleting the active note
	const handleDeleteItem = useCallback(
		async (id: string) => {
			// Already guarded deleteItem will be called
			// Navigate away FIRST if deleting the active note (optimistic)
			if (id === activeNoteId) {
				router.push('/')
			}
			// Then perform the delete (UI already updated optimistically)
			return deleteItem(id)
		},
		[activeNoteId, deleteItem, router]
	)

	// Load expanded folders from localStorage
	useEffect(() => {
		const stored = localStorage.getItem(EXPANDED_FOLDERS_KEY)
		if (stored) {
			try {
				const expanded = JSON.parse(stored)
				setExpandedFolders(new Set(expanded))
			} catch (error) {
				console.error('Error loading expanded folders:', error)
			}
		}
	}, [])

	useEffect(() => {
		localStorage.setItem(
			EXPANDED_FOLDERS_KEY,
			JSON.stringify(Array.from(expandedFolders))
		)
	}, [expandedFolders])

	const handleToggleFolder = useCallback(
		(id: string) => {
			setExpandedFolders((prev) => {
				const newSet = new Set(prev)

				if (newSet.has(id)) {
					// If folder is already expanded, collapse it
					newSet.delete(id)
				} else {
					// If folder is collapsed, expand it smartly to show first file
					const findFirstNotePath = (
						items: Item[],
						targetId: string
					): string[] | null => {
						// Find the target folder first
						const findFolder = (
							itemList: Item[],
							folderId: string
						): Item | null => {
							for (const item of itemList) {
								if (
									item.id === folderId &&
									item.type === 'folder'
								) {
									return item
								}
								if (item.type === 'folder') {
									const found = findFolder(
										item.children,
										folderId
									)
									if (found) return found
								}
							}
							return null
						}

						const targetFolder = findFolder(items, targetId)
						if (!targetFolder) return null

						// Find the first note in this folder's hierarchy
						const findFirstNoteInHierarchy = (
							folder: Item
						): string[] | null => {
							if (folder.type !== 'folder') return null

							// Check direct children for notes first
							for (const child of folder.children) {
								if (child.type === 'note') {
									return [folder.id] // Path stops here - we found a note
								}
							}

							// If no direct notes, check subfolders recursively
							for (const child of folder.children) {
								if (child.type === 'folder') {
									const subPath =
										findFirstNoteInHierarchy(child)
									if (subPath) {
										return [folder.id, ...subPath]
									}
								}
							}

							return null // No notes found in this folder
						}

						return findFirstNoteInHierarchy(targetFolder)
					}

					// Find the path to the first note
					const firstNotePath = findFirstNotePath(items, id)

					if (firstNotePath) {
						// Expand all folders in the path to the first note
						firstNotePath.forEach((folderId) => {
							newSet.add(folderId)
						})
					} else {
						// If no notes found, just expand this folder
						newSet.add(id)
					}
				}

				return newSet
			})
		},
		[items]
	)

	const handleSelectFolder = useCallback((folderId: string | null) => {
		setSelectedFolderId(folderId)
	}, [])

	useEffect(() => {
		if (selectedFolderId) {
			const findActualItem = (
				itemList: Item[],
				id: string
			): Item | undefined => {
				for (const item of itemList) {
					if (item.id === id) return item
					if (item.type === 'folder') {
						const found = findActualItem(item.children, id)
						if (found) return found
					}
				}
				return undefined
			}

			const folderExists = findActualItem(items, selectedFolderId)
			if (!folderExists) {
				setSelectedFolderId(null)
			}
		}
	}, [items, selectedFolderId])

	const handleCreateNote = useCallback(
		async (parentId?: string) => {
			// Guard against event objects being passed as parentId
			const safeParentId = typeof parentId === 'string' ? parentId : undefined
			const targetFolderId =
				safeParentId !== undefined ? safeParentId : selectedFolderId

			// Expand parent folder if creating inside a folder
			if (targetFolderId) {
				setExpandedFolders((prev) => {
					const newSet = new Set(prev)
					newSet.add(targetFolderId)
					return newSet
				})
			}

			const newNote = await createNote(
				'Untitled',
				targetFolderId || undefined
			)
			if (!newNote) return // Blocked

			const url = getNoteUrl(newNote.id)
			router.push(`${url}?focus=true`)
			setSelectedFolderId(null)

			if (isMobile) {
				setMobileSidebarOpen(false)
			}
		},
		[createNote, router, selectedFolderId, getNoteUrl, isMobile, setMobileSidebarOpen]
	)

	const handleCreateFolder = useCallback(
		async (parentId?: string) => {
			// Guard against event objects being passed as parentId
			const safeParentId = typeof parentId === 'string' ? parentId : undefined
			const targetFolderId =
				safeParentId !== undefined ? safeParentId : selectedFolderId

			if (targetFolderId) {
				setExpandedFolders((prev) => {
					const newSet = new Set(prev)
					newSet.add(targetFolderId)
					return newSet
				})
			}

			await createFolder('New Folder', targetFolderId || undefined)
		},
		[createFolder, selectedFolderId]
	)

	const handleDragStart = useCallback((item: Item, e: React.DragEvent) => {
		draggedItemRef.current = item
		e.dataTransfer.effectAllowed = 'move'
	}, [])

	const handleNavigateToRoot = useCallback(() => {
		router.push('/')
	}, [router])

	const handleNavigateToUIPlayground = useCallback(() => {
		// No navigation needed for UI playground - it's already handled
	}, [])

	const handleActionBarNoteCreate = useCallback(() => {
		handleCreateNote()
	}, [handleCreateNote])

	const handleActionBarFolderCreate = useCallback(() => {
		handleCreateFolder()
	}, [handleCreateFolder])

	const handleSidebarClick = useCallback((e: React.MouseEvent) => {
		if (e.target === e.currentTarget) {
			setSelectedFolderId(null)
			clearSelection()
		}
	}, [clearSelection])

	const handleTreeClick = useCallback((e: React.MouseEvent) => {
		if (e.target === e.currentTarget) {
			setSelectedFolderId(null)
			clearSelection()
		}
	}, [clearSelection])

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault()
	}, [])

	const handleNoteNavigation = useCallback(
		(id: string) => {
			router.push(getNoteUrl(id))
			if (isMobile) {
				setMobileSidebarOpen(false)
			}
		},
		[router, getNoteUrl, isMobile, setMobileSidebarOpen]
	)

	const handleDrop = useCallback(
		async (targetId: string, e: React.DragEvent) => {
			e.preventDefault()
			if (!draggedItemRef.current) return

			const draggedItem = draggedItemRef.current
			if (draggedItem.id === targetId) {
				draggedItemRef.current = null
				return
			}

			const findActualItem = (
				itemList: Item[],
				id: string
			): Item | undefined => {
				for (const item of itemList) {
					if (item.id === id) return item
					if (item.type === 'folder') {
						const found = findActualItem(item.children, id)
						if (found) return found
					}
				}
				return undefined
			}

			const targetItem = findActualItem(items, targetId)
			if (!targetItem || targetItem.type !== 'folder') {
				draggedItemRef.current = null
				return
			}

			const isDescendant = (
				parentId: string,
				childId: string
			): boolean => {
				const parent = findActualItem(items, parentId)
				if (!parent || parent.type !== 'folder') return false

				function checkChildren(folder: FolderType): boolean {
					return folder.children.some((child: any) => {
						if (child.id === childId) return true
						if (child.type === 'folder') {
							return checkChildren(child as FolderType)
						}
						return false
					})
				}

				return checkChildren(parent as FolderType)
			}

			if (
				draggedItem.type === 'folder' &&
				isDescendant(draggedItem.id, targetId)
			) {
				draggedItemRef.current = null
				return
			}

			const isAlreadyInTarget =
				targetItem.type === 'folder' &&
				targetItem.children.some((child: any) => child.id === draggedItem.id)
			if (isAlreadyInTarget) {
				draggedItemRef.current = null
				return
			}

			// Expand target folder so user can see the moved item
			setExpandedFolders((prev) => {
				const newSet = new Set(prev)
				newSet.add(targetId)
				return newSet
			})

			const success = await moveItem(draggedItem.id, targetId)
			draggedItemRef.current = null

			if (!success) {
				console.error('Failed to move item')
			}
		},
		[items, moveItem]
	)

	const collectAllFolderIds = useCallback((items: Item[]): string[] => {
		const folderIds: string[] = []
		function traverse(item: Item) {
			if (item.type === 'folder') {
				folderIds.push(item.id)
					; (item.children || []).forEach(traverse)
			}
		}
		items.forEach(traverse)
		return folderIds
	}, [])

	const areAllFoldersExpanded = useMemo(() => {
		const allFolderIds = collectAllFolderIds(items)
		return (
			allFolderIds.length > 0 &&
			allFolderIds.every((id) => expandedFolders.has(id))
		)
	}, [items, expandedFolders, collectAllFolderIds])

	const handleExpandCollapseAll = useCallback(() => {
		const allFolderIds = collectAllFolderIds(items)
		if (areAllFoldersExpanded) {
			setExpandedFolders(new Set())
		} else {
			setExpandedFolders(new Set(allFolderIds))
		}
	}, [items, areAllFoldersExpanded, collectAllFolderIds])

	const handleSearchToggle = useCallback(() => {
		setIsSearchOpen((prev) => !prev)
	}, [])

	const handleSearchClose = useCallback(() => {
		setIsSearchOpen(false)
		setSearchQuery('')
	}, [])

	const handleContextMenuOpenChange = useCallback(
		(
			open: boolean,
			itemId: string,
			handlers: {
				onDelete: (id: string) => void
				onCreateNote: (id: string) => void
				onCreateFolder: (id: string) => void
				onRename: (id: string) => void
				onPinItem: (id: string) => void
			}
		) => {
			if (open) {
				setContextMenuState({
					itemId,
					...handlers
				})
			} else {
				setContextMenuState({
					itemId: null,
					onDelete: null,
					onCreateNote: null,
					onCreateFolder: null,
					onRename: null,
					onPinItem: null
				})
			}
		},
		[setContextMenuState]
	)

	useShortcut(
		'delete-item',
		useCallback(
			(e: KeyboardEvent) => {
				// Don't handle if items are selected (bulk delete takes precedence)
				if (getSelectedCount() > 0) {
					return
				}
				e.preventDefault()
				if (contextMenuState.itemId && contextMenuState.onDelete) {
					contextMenuState.onDelete(contextMenuState.itemId)
					setContextMenuState({
						itemId: null,
						onDelete: null,
						onCreateNote: null,
						onCreateFolder: null,
						onRename: null,
						onPinItem: null
					})
				}
			},
			[contextMenuState, setContextMenuState, getSelectedCount]
		)
	)

	useShortcut(
		'create-note',
		useCallback(
			(e: KeyboardEvent) => {
				e.preventDefault()
				if (contextMenuState.itemId && contextMenuState.onCreateNote) {
					contextMenuState.onCreateNote(contextMenuState.itemId)
					setContextMenuState({
						itemId: null,
						onDelete: null,
						onCreateNote: null,
						onCreateFolder: null,
						onRename: null,
						onPinItem: null
					})
				}
			},
			[contextMenuState, setContextMenuState]
		)
	)

	useShortcut(
		'create-folder',
		useCallback(
			(e: KeyboardEvent) => {
				e.preventDefault()
				if (
					contextMenuState.itemId &&
					contextMenuState.onCreateFolder
				) {
					contextMenuState.onCreateFolder(contextMenuState.itemId)
					setContextMenuState({
						itemId: null,
						onDelete: null,
						onCreateNote: null,
						onCreateFolder: null,
						onRename: null,
						onPinItem: null
					})
				}
			},
			[contextMenuState, setContextMenuState]
		)
	)

	useShortcut(
		'rename-item',
		useCallback(
			(e: KeyboardEvent) => {
				if (contextMenuState.itemId && contextMenuState.onRename) {
					e.preventDefault()
					contextMenuState.onRename(contextMenuState.itemId)
					setContextMenuState({
						itemId: null,
						onDelete: null,
						onCreateNote: null,
						onCreateFolder: null,
						onRename: null,
						onPinItem: null
					})
				}
			},
			[contextMenuState, setContextMenuState]
		)
	)

	useShortcut(
		'pin-item',
		useCallback(
			(e: KeyboardEvent) => {
				if (contextMenuState.itemId && contextMenuState.onPinItem) {
					e.preventDefault()
					contextMenuState.onPinItem(contextMenuState.itemId)
					setContextMenuState({
						itemId: null,
						onDelete: null,
						onCreateNote: null,
						onCreateFolder: null,
						onRename: null,
						onPinItem: null
					})
				}
			},
			[contextMenuState, setContextMenuState]
		)
	)

	const getAllVisibleItemIds = useCallback(
		(items: Item[]): string[] => {
			const ids: string[] = []
			function traverse(itemList: Item[]) {
				for (const item of itemList) {
					ids.push(item.id)
					if (
						item.type === 'folder' &&
						expandedFolders.has(item.id)
					) {
						traverse(item.children)
					}
				}
			}
			traverse(items)
			return ids
		},
		[expandedFolders]
	)

	const sortItems = useCallback((items: Item[]): Item[] => {
		const sorted = [...items]
			.sort((a, b) => {
				// Pinned items first
				if (a.pinned && !b.pinned) return -1
				if (!a.pinned && b.pinned) return 1

				if (a.pinned && b.pinned) {
					const aPinnedAt = a.pinnedAt || a.createdAt
					const bPinnedAt = b.pinnedAt || b.createdAt
					if (aPinnedAt !== bPinnedAt) {
						return bPinnedAt - aPinnedAt // Most recent first
					}
				}

				if (!a.pinned && !b.pinned) {
					const aFavorite = a.type === 'note' && a.favorite
					const bFavorite = b.type === 'note' && b.favorite
					if (aFavorite && !bFavorite) return -1
					if (!aFavorite && bFavorite) return 1
				}

				if (!a.pinned && !b.pinned) {
					if (a.type === 'folder' && b.type === 'note') return -1
					if (a.type === 'note' && b.type === 'folder') return 1
				}

				return a.name.localeCompare(b.name)
			})
			.map((item) => {
				if (item.type === 'folder') {
					return {
						...item,
						children: [...sortItems(item.children)] // Ensure new array reference
					}
				}
				return { ...item } // Create new object reference for notes too
			})
		return sorted
	}, [])

	const filteredItems = useMemo(() => {
		if (!searchQuery.trim()) {
			return sortItems(items)
		}

		const query = searchQuery.toLowerCase().trim()

		function filterItems(itemList: Item[]): Item[] {
			const filtered: Item[] = []

			for (const item of itemList) {
				const nameMatches = item.name.toLowerCase().includes(query)

				let contentMatches = false
				if (
					searchInContent &&
					item.type === 'note' &&
					'content' in item
				) {
					const note = item as { content?: Block[] }
					if (note.content && Array.isArray(note.content)) {
						try {
							const contentText = blocksToText(note.content)
							contentMatches = contentText
								.toLowerCase()
								.includes(query)
						} catch (error) {
							// If content extraction fails, just search by name
							console.warn(
								'Failed to extract text from note content:',
								error
							)
						}
					}
				}

				if (nameMatches || contentMatches) {
					if (item.type === 'folder') {
						const filteredChildren = filterItems(item.children)
						filtered.push({
							...item,
							children: filteredChildren
						} as Item)
					} else {
						filtered.push(item)
					}
				} else if (item.type === 'folder') {
					const filteredChildren = filterItems(item.children)
					if (filteredChildren.length > 0) {
						filtered.push({
							...item,
							children: filteredChildren
						} as Item)
					}
				}
			}

			return filtered
		}

		return sortItems(filterItems(items))
	}, [items, searchQuery, sortItems, searchInContent])

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Check if we're in an input/editor context
			const target = e.target as HTMLElement
			const isInput =
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.isContentEditable ||
				!!target.closest('[contenteditable="true"]')

			if (isInput) {
				return
			}

			if (e.key === 'Escape' && getSelectedCount() > 0) {
				clearSelection()
				return
			}

			if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
				e.preventDefault()
				const allIds = getAllVisibleItemIds(filteredItems)
				selectAll(allIds)
				return
			}

			if (e.key === 'Delete' && getSelectedCount() > 0) {
				e.preventDefault()
				const ids = getSelectedIds()
				for (const id of ids) {
					handleDeleteItem(id).catch((error) => {
						console.error(`Failed to delete item ${id}:`, error)
					})
				}
				clearSelection()
				return
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [
		getSelectedCount,
		clearSelection,
		selectAll,
		getSelectedIds,
		handleDeleteItem,
		getAllVisibleItemIds,
		filteredItems,
		showConfirm
	])

	if (finalContentType === 'custom' && customContent) {
		return <>{customContent}</>
	}

	if (finalContentType === 'table-of-contents') {
		return customContent || null
	}

	if (finalContentType === 'tasks') {
		return <TasksSidebarContent activeNoteId={activeNoteId} />
	}

	const isCollapsed = !isDesktopSidebarOpen

	if (isCollapsed) {
		return (
			<div className="w-12 h-full bg-sidebar-background flex flex-col border-r border-sidebar-border">
				<div className="flex flex-col items-center gap-2 pt-1.5 flex-1">
					<IconButton
						icon={<NotesIcon />}
						tooltip="Notes"
						active={true}
						variant="sidebar"
						onClick={handleNavigateToRoot}
					/>
					<IconButton
						icon={<UIPlaygroundIcon />}
						tooltip="UI Playground"
						variant="sidebar"
					/>
				</div>
			</div>
		)
	}

	return (
		<div
			className={cn(
				'h-full bg-sidebar-background flex flex-col border-r border-sidebar-border bg-background',
				isMobile ? 'w-[280px] max-w-[85vw]' : 'w-[210px]'
			)}
		>
			<ActionBar
				onCreateNote={handleActionBarNoteCreate}
				onCreateFolder={handleActionBarFolderCreate}
				searchConfig={{
					query: searchQuery,
					setQuery: setSearchQuery,
					close: handleSearchClose,
					toggle: handleSearchToggle,
					isOpen: isSearchOpen
				}}
				expandConfig={{
					isExpanded: areAllFoldersExpanded,
					onToggle: handleExpandCollapseAll
				}}
			/>
			<div
				className="flex-1 overflow-y-auto px-2 pt-2 pb-4"
				onClick={handleSidebarClick}
			>
				<div
					className="flex flex-col items-start gap-1 w-full"
					role="tree"
					aria-label="Notes"
					onClick={handleTreeClick}
				>
					{isInitialLoading || isRefreshing ? (
						/* Skeleton loader to prevent layout shift during initial load and refreshes */
						<div className="flex flex-col gap-0.5 w-full animate-pulse">
							{Array.from({ length: 8 }).map((_, i) => {
								const isFolder = i % 3 === 0
								const hasChildren = isFolder && i < 3
								return (
									<div key={i}>
										<div className="flex items-center justify-between h-7 rounded-md px-1">
											<div className="flex items-center gap-1.5 flex-1">
												<div className="h-4 w-4 rounded bg-muted-foreground/20" />
												<div
													className="h-3 rounded bg-muted-foreground/20"
													style={{
														width: `${60 + ((i * 13) % 60)}px`
													}}
												/>
											</div>
											{isFolder && (
												<div className="h-3 w-4 rounded bg-muted-foreground/15" />
											)}
										</div>
										{hasChildren && (
											<div className="ml-4 space-y-0.5 mt-0.5">
												{Array.from({ length: 2 }).map(
													(_, j) => (
														<div
															key={j}
															className="flex items-center gap-1.5 h-7 px-1"
														>
															<div className="h-4 w-4 rounded bg-muted-foreground/20" />
															<div
																className="h-3 rounded bg-muted-foreground/20"
																style={{
																	width: `${50 + ((j * 20) % 50)}px`
																}}
															/>
														</div>
													)
												)}
											</div>
										)}
									</div>
								)
							})}
						</div>
					) : filteredItems.length === 0 ? (
						<div className="flex-1 w-full">
							<SidebarEmptyState hasSearchQuery={!!searchQuery} />
						</div>
					) : (
						filteredItems.map((item, index, arr) => (
							<FileTreeItem
								key={item.id}
								item={item}
								isLast={index === arr.length - 1}
								parentGuides={[]}
								activeNoteId={activeNoteId}
								expandedFolders={expandedFolders}
								selectedFolderId={selectedFolderId}
								onToggleFolder={handleToggleFolder}
								onNavigateNote={handleNoteNavigation}
								onRename={renameItem}
								onDelete={handleDeleteItem}
								onCreateNote={handleCreateNote}
								onCreateFolder={handleCreateFolder}
								onDragStart={handleDragStart}
								onDragOver={handleDragOver}
								onDrop={handleDrop}
								onSelectFolder={handleSelectFolder}
								onContextMenuOpenChange={
									handleContextMenuOpenChange
								}
								onPinItem={pinItem}
								onFavoriteNote={favoriteNote}
								onMoveItem={moveItem}
								allItems={items}
								ruler={ruler}
								openTabIds={openTabIds}
								allVisibleItemIds={getAllVisibleItemIds(
									filteredItems
								)}
								showConfirm={showConfirm}
							/>
						))
					)}
				</div>
			</div>
			<SidebarConfirmationPopover />
		</div>
	)
}
