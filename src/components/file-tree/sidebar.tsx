import type { Folder, Note } from '@/api/db/schema'
import { ActionBar } from '@/components/file-tree/action-bar'
import { useDragState } from '@/hooks/use-drag-state'
import { useDestroyFolder } from '@/modules/folders/api/mutations/destroy'
import {
	useMoveFolder,
	useMoveFolderToRoot
} from '@/modules/folders/api/mutations/move'
import { useUpdateFolder } from '@/modules/folders/api/mutations/update'
import { useGetFolders } from '@/modules/folders/api/queries/get-folders'
import { useDestroyNote } from '@/modules/notes/api/mutations/destroy'
import { useDuplicateNote } from '@/modules/notes/api/mutations/duplicate'
import {
	useMoveNote,
	useMoveNoteToRoot,
	useReorderNote
} from '@/modules/notes/api/mutations/move'
import { usePinNote } from '@/modules/notes/api/mutations/pin'
import { useUpdateNote } from '@/modules/notes/api/mutations/update'
import { useGetNotes } from '@/modules/notes/api/queries/get-notes'
import { useSidebarSearch } from '@/modules/search/hooks/use-sidebar-search'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { cn } from 'utils'
import { FileItem } from './file-item'
import { FolderItem } from './folder-item'

type props = {
	onNoteSelect?: (noteId: string) => void
	onNoteCreate?: (noteId: string) => void
	onNoteDuplicate?: (noteId: string) => Promise<string | undefined>
	selectedNoteId?: string | null
}

export const Sidebar = ({
	onNoteSelect,
	onNoteCreate,
	onNoteDuplicate,
	selectedNoteId
}: props = {}) => {
	const { folders = [] } = useGetFolders()
	const { notes = [] } = useGetNotes()
	const {
		folders: searchFolders,
		notes: searchNotes,
		searchState
	} = useSidebarSearch()
	const { updateFolder } = useUpdateFolder()
	const { updateNote } = useUpdateNote()

	const [isExpanded, setIsExpanded] = useState(false)
	const [activeFile, setActiveFile] = useState<string | null>(
		selectedNoteId || null
	)
	const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())
	const [focusedIndex, setFocusedIndex] = useState<number>(-1)
	const treeRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (selectedNoteId !== undefined && selectedNoteId !== activeFile) {
			setActiveFile(selectedNoteId)
		}
	}, [selectedNoteId]) // eslint-disable-line react-hooks/exhaustive-deps

	const dragState = useDragState()
	const { moveFolder } = useMoveFolder()
	const { moveFolderToRoot } = useMoveFolderToRoot()
	const { destroyFolder } = useDestroyFolder()
	const { moveNote } = useMoveNote()
	const { moveNoteToRoot } = useMoveNoteToRoot()
	const { reorderNote } = useReorderNote()
	const { destroyNote } = useDestroyNote()
	const { duplicateNote } = useDuplicateNote()
	const { pinNote } = usePinNote()

	useEffect(() => {
		if (!dragState.draggedFolderId && !dragState.draggedNoteId) {
			dragState.clearDragOver()
		}
	}, [
		dragState.draggedFolderId,
		dragState.draggedNoteId,
		dragState.clearDragOver
	])

	const rootFolders = useMemo(
		() => folders.filter((f: Folder) => !f.deletedAt && !(f.parent as any)),
		[folders]
	)
	const rootNotes = useMemo(
		() => notes.filter((n: Note) => !(n.folder as any)),
		[notes]
	)

	const displayFolders = useMemo(() => {
		if (searchState.query) {
			return searchFolders
		}
		return [...rootFolders].sort(
			(a: Folder, b: Folder) => (a.position || 0) - (b.position || 0)
		)
	}, [searchState.query, searchFolders, rootFolders])

	const displayNotes = useMemo(() => {
		if (searchState.query) {
			return searchNotes
		}
		// Sort: pinned notes first (by position ascending), then unpinned notes (by position ascending)
		return [...rootNotes].sort((a: Note, b: Note) => {
			const aPinned = a.pinned || false
			const bPinned = b.pinned || false

			// Pinned notes come first
			if (aPinned && !bPinned) return -1
			if (!aPinned && bPinned) return 1

			// Within same pinned status, sort by position
			return (a.position || 0) - (b.position || 0)
		})
	}, [searchState.query, searchNotes, rootNotes])

	const getChildrenCount = (folderId: string) => {
		const childNotes = notes.filter(
			(note: Note) => (note.folder as any)?.id === folderId
		)
		const childFolders = folders.filter(
			(folder: Folder) =>
				(folder.parent as any)?.id === folderId && !folder.deletedAt
		)
		return childNotes.length + childFolders.length
	}

	// Get the full path of a folder (all parent IDs)
	const getFolderPath = (folderId: string): string[] => {
		const path: string[] = []
		let currentId = folderId

		while (currentId) {
			path.unshift(currentId)
			const folder = folders.find((f: Folder) => f.id === currentId)
			currentId = folder ? (folder.parent as any)?.id : null
		}

		return path
	}

	// Get notes for a specific folder
	const getFolderNotes = (folderId: string) => {
		return notes
			.filter((note: Note) => (note.folder as any)?.id === folderId)
			.sort((a: Note, b: Note) => {
				const aPinned = a.pinned || false
				const bPinned = b.pinned || false

				// Pinned notes come first
				if (aPinned && !bPinned) return -1
				if (!aPinned && bPinned) return 1

				// Within same pinned status, sort by position
				return (a.position || 0) - (b.position || 0)
			})
	}

	// Get sub-folders for a specific folder
	const getSubFolders = (folderId: string) => {
		return folders
			.filter(
				(folder: Folder) =>
					(folder.parent as any)?.id === folderId && !folder.deletedAt
			)
			.sort(
				(a: Folder, b: Folder) => (a.position || 0) - (b.position || 0)
			)
	}

	const handleExpandToggle = useCallback(() => {
		if (isExpanded) {
			// Collapse all folders
			setOpenFolders(new Set())
		} else {
			// Expand all folders
			setOpenFolders(
				new Set(displayFolders.map((f: any) => ('item' in f ? f.item?.id : f.id)))
			)
		}
		setIsExpanded(!isExpanded)
	}, [isExpanded, displayFolders])

	const toggleFolder = (folderId: string) => {
		setOpenFolders(prev => {
			const next = new Set(prev)
			if (next.has(folderId)) {
				next.delete(folderId)
			} else {
				next.add(folderId)
			}
			return next
		})
	}

	const handleFolderRename = async (id: string, newName: string) => {
		try {
			await updateFolder(id, { name: newName })
		} catch (error) {
			console.error('Failed to rename folder:', error)
		}
	}

	const handleFolderDelete = async (id: string) => {
		try {
			await destroyFolder(id)
		} catch (error) {
			console.error('Failed to delete folder:', error)
		}
	}

	const handleFolderMove = async (
		folderId: string,
		targetFolderId: string | null
	) => {
		try {
			if (targetFolderId === null) {
				await moveFolderToRoot({ draggedFolderId: folderId, folders })
			} else {
				await moveFolder({
					draggedFolderId: folderId,
					targetFolderId,
					position: 'inside',
					folders
				})
				// Expand the target folder
				const pathToExpand = getFolderPath(targetFolderId)
				setOpenFolders(prev => {
					const next = new Set(prev)
					pathToExpand.forEach(folderId => next.add(folderId))
					return next
				})
			}
		} catch (error) {
			console.error('Failed to move folder:', error)
		}
	}

	const handleNoteRename = async (id: string, newName: string) => {
		try {
			await updateNote(id, { title: newName })
		} catch (error) {
			console.error('Failed to rename note:', error)
		}
	}

	const handleNoteDelete = async (id: string) => {
		try {
			await destroyNote(id)
			if (activeFile === id) {
				setActiveFile(null)
				onNoteSelect?.(null as any)
			}
		} catch (error) {
			console.error('Failed to delete note:', error)
		}
	}

	const handleNoteDuplicate = async (id: string) => {
		try {
			const result = await duplicateNote({ noteId: id, notes })
			if (result?.id && onNoteDuplicate) {
				// Wait a bit for the note to be available in the list
				setTimeout(() => {
					onNoteDuplicate(result.id)
				}, 100)
			}
		} catch (error) {
			console.error('Failed to duplicate note:', error)
		}
	}

	const handleNoteMove = async (noteId: string, folderId: string | null) => {
		try {
			if (folderId === null) {
				await moveNoteToRoot({ draggedNoteId: noteId, notes })
			} else {
				await moveNote({
					draggedNoteId: noteId,
					targetFolderId: folderId,
					position: 'inside',
					notes,
					folders
				})
				// Expand the target folder
				const pathToExpand = getFolderPath(folderId)
				setOpenFolders(prev => {
					const next = new Set(prev)
					pathToExpand.forEach(folderId => next.add(folderId))
					return next
				})
			}
		} catch (error) {
			console.error('Failed to move note:', error)
		}
	}

	const handleNotePin = async (noteId: string, pinned: boolean) => {
		try {
			await pinNote({ noteId, notes, pinned })
			if (pinned) {
				// Select the pinned note after pinning
				setTimeout(() => {
					onNoteSelect?.(noteId)
				}, 100)
			}
		} catch (error) {
			console.error('Failed to pin/unpin note:', error)
		}
	}

	const handleNoteClick = useCallback(
		(noteId: string) => {
			setActiveFile(noteId)
			onNoteSelect?.(noteId)
		},
		[onNoteSelect]
	)

	const handleDragStart = (type: 'folder' | 'note', id: string) => {
		if (type === 'folder') {
			dragState.startDragFolder(id)
		} else {
			dragState.startDragNote(id)
		}
	}

	const handleDragEnd = () => {
		dragState.endDrag()
	}

	const handleDragOver = (
		folderId: string,
		position: 'before' | 'after' | 'inside'
	) => {
		if (dragState.draggedFolderId === folderId) return
		dragState.setDragOver(folderId, position)
	}

	const handleDragLeave = () => {
		dragState.clearDragOver()
	}

	const handleDrop = async (
		targetFolderId: string,
		position: 'before' | 'after' | 'inside'
	) => {
		try {
			if (dragState.draggedFolderId) {
				const result = await moveFolder({
					draggedFolderId: dragState.draggedFolderId,
					targetFolderId,
					position,
					folders
				})

				if (result?.newParentId) {
					const pathToExpand = getFolderPath(result.newParentId)
					if (position === 'inside') {
						pathToExpand.push(targetFolderId)
					}
					setOpenFolders(prev => {
						const next = new Set(prev)
						pathToExpand.forEach(folderId => next.add(folderId))
						return next
					})
				}
			} else if (dragState.draggedNoteId) {
				const result = await moveNote({
					draggedNoteId: dragState.draggedNoteId,
					targetFolderId,
					position,
					notes,
					folders
				})

				if (result?.newParentId) {
					const pathToExpand = getFolderPath(result.newParentId)
					if (position === 'inside') {
						pathToExpand.push(targetFolderId)
					}
					setOpenFolders(prev => {
						const next = new Set(prev)
						pathToExpand.forEach(folderId => next.add(folderId))
						return next
					})
				}
			}
		} catch (error) {
			console.error('Failed to move item:', error)
		}

		dragState.endDrag()
	}

	const handleDragOverRoot = (e: React.DragEvent) => {
		if (!dragState.draggedNoteId && !dragState.draggedFolderId) return
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
		dragState.setDragOverRoot(true)
	}

	const handleDragLeaveRoot = () => {
		dragState.setDragOverRoot(false)
	}

	const handleDropOnRoot = async (e: React.DragEvent) => {
		e.preventDefault()
		try {
			if (dragState.draggedNoteId) {
				await moveNoteToRoot({
					draggedNoteId: dragState.draggedNoteId,
					notes
				})
			} else if (dragState.draggedFolderId) {
				await moveFolderToRoot({
					draggedFolderId: dragState.draggedFolderId,
					folders
				})
			}
		} catch (error) {
			console.error('Failed to move item to root:', error)
		}
		dragState.setDragOverRoot(false)
		dragState.endDrag()
	}

	const handleNoteReorder = async (
		draggedNoteId: string,
		targetNoteId: string,
		position: 'before' | 'after'
	) => {
		try {
			await reorderNote({ draggedNoteId, targetNoteId, position, notes })
		} catch (error) {
			console.error('Failed to reorder note:', error)
		}
		dragState.endDrag()
	}

	// Create a flat list of all navigable items for keyboard navigation
	const getFlatItemsList = useCallback(() => {
		const items: Array<{
			type: 'folder' | 'note'
			id: string
			name: string
			level: number
		}> = []

		const addFolderItems = (folderList: any[], level: number = 0) => {
			folderList.forEach(folderData => {
				const folder = 'item' in folderData ? folderData.item : folderData
				items.push({
					type: 'folder',
					id: folder.id,
					name: folder.name,
					level
				})

				if (openFolders.has(folder.id)) {
					const subFolders = getSubFolders(folder.id)
					if (subFolders.length > 0) {
						addFolderItems(subFolders, level + 1)
					}

					const folderNotes = getFolderNotes(folder.id)
					folderNotes.forEach(note => {
						items.push({
							type: 'note',
							id: note.id,
							name: note.title,
							level: level + 1
						})
					})
				}
			})
		}

		// Add folders and their contents
		addFolderItems(displayFolders)

		// Add root level notes
		displayNotes.forEach(noteData => {
			const note = 'item' in noteData ? noteData.item : noteData
			items.push({
				type: 'note',
				id: note.id,
				name: note.title,
				level: 0
			})
		})

		return items
	}, [
		displayFolders,
		displayNotes,
		openFolders,
		getSubFolders,
		getFolderNotes
	])

	// Handle keyboard navigation
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			const items = getFlatItemsList()

			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault()
					const nextIndex = Math.min(
						focusedIndex + 1,
						items.length - 1
					)
					setFocusedIndex(nextIndex)
					break

				case 'ArrowUp':
					e.preventDefault()
					const prevIndex = Math.max(focusedIndex - 1, 0)
					setFocusedIndex(prevIndex)
					break

				case 'ArrowRight':
					e.preventDefault()
					if (focusedIndex >= 0 && focusedIndex < items.length) {
						const item = items[focusedIndex]
						if (
							item.type === 'folder' &&
							!openFolders.has(item.id)
						) {
							toggleFolder(item.id)
						}
					}
					break

				case 'ArrowLeft':
					e.preventDefault()
					if (focusedIndex >= 0 && focusedIndex < items.length) {
						const item = items[focusedIndex]
						if (
							item.type === 'folder' &&
							openFolders.has(item.id)
						) {
							toggleFolder(item.id)
						}
					}
					break

				case 'Enter':
				case ' ':
					e.preventDefault()
					if (focusedIndex >= 0 && focusedIndex < items.length) {
						const item = items[focusedIndex]
						if (item.type === 'folder') {
							toggleFolder(item.id)
						} else if (item.type === 'note') {
							handleNoteClick(item.id)
						}
					}
					break

				case 'Home':
					e.preventDefault()
					setFocusedIndex(0)
					break

				case 'End':
					e.preventDefault()
					setFocusedIndex(items.length - 1)
					break
			}
		},
		[
			focusedIndex,
			getFlatItemsList,
			openFolders,
			toggleFolder,
			handleNoteClick
		]
	)

	// Get current focused item for rendering focus state
	const getFocusedItem = useCallback(() => {
		const items = getFlatItemsList()
		if (focusedIndex >= 0 && focusedIndex < items.length) {
			return items[focusedIndex]
		}
		return null
	}, [focusedIndex, getFlatItemsList])

	const focusedItem = getFocusedItem()

	// Check if an item should be focused
	const isItemFocused = useCallback(
		(type: 'folder' | 'note', id: string) => {
			return focusedItem?.type === type && focusedItem?.id === id
		},
		[focusedItem]
	)

	// Handle focus for tree items
	const handleItemFocus = useCallback(
		(type: 'folder' | 'note', id: string) => {
			const items = getFlatItemsList()
			const index = items.findIndex(
				item => item.type === type && item.id === id
			)
			if (index !== -1) {
				setFocusedIndex(index)
			}
		},
		[getFlatItemsList]
	)

	return (
		<nav
			className={cn(
				'fixed left-0 sm:left-12 flex flex-col justify-start items-center bg-background overflow-y-auto',
				'transform transition-all duration-300 border-r'
			)}
			style={{
				width: '210px',
				height: 'calc(100vh - 4.5rem)'
			}}
			role="navigation"
			aria-label="File and folder navigation"
		>
			{/* Resize handle */}
			<div
				className={cn(
					'h-full w-1 border-r cursor-col-resize absolute top-0 right-0 z-10',
					'hover:bg-foreground/10 hover:delay-75 transition-all duration-200',
					'active:bg-foreground/20 active:!cursor-col-resize'
				)}
				role="presentation"
			/>

			<ActionBar
				isExpanded={isExpanded}
				onExpandToggle={handleExpandToggle}
				onNoteCreate={onNoteCreate}
			/>

			{/* File list */}
			<div
				ref={treeRef}
				className={cn(
					'flex flex-col items-start gap-1 w-full px-2 h-full overflow-auto pt-2 pb-4',
					dragState.dragOverRoot && 'bg-accent/10'
				)}
				onDragOver={handleDragOverRoot}
				onDragLeave={handleDragLeaveRoot}
				onDrop={handleDropOnRoot}
				onKeyDown={handleKeyDown}
				role="tree"
				aria-label="File tree"
				tabIndex={0}
			>
				{displayFolders.map((folderData: any) => {
					const folder = 'item' in folderData ? folderData.item : folderData
					const folderFiles = getFolderNotes(folder.id)
					const folderSubFolders = getSubFolders(folder.id)
					const folderChildrenCount = getChildrenCount(folder.id)

					return (
						<FolderItem
							key={folder.id}
							id={folder.id}
							name={folder.name}
							path={folder.path || `/${folder.name}`}
							files={folderFiles}
							subFolders={folderSubFolders}
							childrenCount={folderChildrenCount}
							activeFile={activeFile || undefined}
							onFileClick={note => handleNoteClick(note.id)}
							onFolderRename={handleFolderRename}
							isOpen={openFolders.has(folder.id)}
							onToggle={() => toggleFolder(folder.id)}
							openFolders={openFolders}
							onToggleFolder={toggleFolder}
							getFolderNotes={getFolderNotes}
							getSubFolders={getSubFolders}
							getChildrenCount={getChildrenCount}
							folders={folders}
							notes={notes}
							onDragStartFolder={handleDragStart}
							onDragOverFolder={handleDragOver}
							onDropFolder={handleDrop}
							isDragOverFolderId={dragState.dragOverFolderId}
							draggedFolderId={dragState.draggedFolderId}
							draggedNoteId={dragState.draggedNoteId}
							dropPositionGlobal={dragState.dropPosition}
							onDragLeaveFolder={handleDragLeave}
							isDragged={dragState.draggedFolderId === folder.id}
							isDragOver={
								dragState.dragOverFolderId === folder.id
							}
							dropPosition={
								dragState.dragOverFolderId === folder.id
									? dragState.dropPosition
									: null
							}
							onDragStart={() =>
								handleDragStart('folder', folder.id)
							}
							onDragEnd={handleDragEnd}
							onDragOver={position =>
								handleDragOver(folder.id, position)
							}
							onDragLeave={handleDragLeave}
							onDrop={position => handleDrop(folder.id, position)}
							onNoteReorder={handleNoteReorder}
							onNoteRename={handleNoteRename}
							onNoteDelete={handleNoteDelete}
							onNoteDuplicate={handleNoteDuplicate}
							onNoteMove={handleNoteMove}
							onNotePin={handleNotePin}
							onFolderDelete={handleFolderDelete}
							onFolderMove={handleFolderMove}
							isFocused={isItemFocused('folder', folder.id)}
							onFocus={() => handleItemFocus('folder', folder.id)}
							isItemFocused={isItemFocused}
							handleItemFocus={handleItemFocus}
						/>
					)
				})}

				{displayNotes.map((noteData: any) => {
					const note = 'item' in noteData ? noteData.item : noteData
					return (
						<FileItem
							key={note.id}
							id={note.id}
							name={note.title}
							path={note.path || `/${note.title}`}
							isActive={activeFile === note.id}
							onClick={handleNoteClick}
							isDragged={dragState.draggedNoteId === note.id}
							draggedNoteId={dragState.draggedNoteId}
							draggedFolderId={dragState.draggedFolderId}
							onDragStart={() => handleDragStart('note', note.id)}
							onDragEnd={handleDragEnd}
							onNoteReorder={handleNoteReorder}
							onNoteRename={handleNoteRename}
							onNoteDelete={handleNoteDelete}
							onNoteDuplicate={handleNoteDuplicate}
							onNoteMove={handleNoteMove}
							onNotePin={handleNotePin}
							pinned={note.pinned || false}
							folders={folders}
							isFocused={isItemFocused('note', note.id)}
							onFocus={() => handleItemFocus('note', note.id)}
						/>
					)
				})}
			</div>
		</nav>
	)
}
