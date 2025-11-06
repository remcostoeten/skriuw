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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
		() => folders.filter((f: Folder) => !f.parent && !(f as any).deletedAt),
		[folders]
	)
	const rootNotes = useMemo(
		() => notes.filter((n: Note) => !n.folder && !(n as any).deletedAt),
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
		return [...rootNotes].sort((a: Note, b: Note) => {
			const aPinned = a.pinned || false
			const bPinned = b.pinned || false

			if (aPinned && !bPinned) return -1
			if (!aPinned && bPinned) return 1

			return (a.position || 0) - (b.position || 0)
		})
	}, [searchState.query, searchNotes, rootNotes])

	function getChildrenCount(folderId: string) {
		const childNotes = notes.filter(
			(note: Note) => note.folder?.id === folderId
		)
		const childFolders = folders.filter(
			(folder: Folder) =>
				folder.parent?.id === folderId
		)
		return childNotes.length + childFolders.length
	}

	function getFolderPath(folderId: string): string[] {
		const path: string[] = []
		let currentId = folderId

		while (currentId) {
			path.unshift(currentId)
			const folder = folders.find((f: Folder) => f.id === currentId)
			currentId = folder ? (folder.parent as any)?.id : null
		}

		return path
	}

	function getFolderNotes(folderId: string) {
		return notes
			.filter((note: Note) => note.folder?.id === folderId)
			.sort((a: Note, b: Note) => {
				const aPinned = a.pinned || false
				const bPinned = b.pinned || false

				if (aPinned && !bPinned) return -1
				if (!aPinned && bPinned) return 1

				return (a.position || 0) - (b.position || 0)
			})
	}

	function getSubFolders(folderId: string) {
		return folders
			.filter(
				(folder: Folder) =>
					folder.parent?.id === folderId
			)
			.sort(
				(a: Folder, b: Folder) => (a.position || 0) - (b.position || 0)
			)
	}

	const handleExpandToggle = useCallback(() => {
		if (isExpanded) {
			setOpenFolders(new Set())
		} else {
			setOpenFolders(
				new Set(displayFolders.map((f: Folder) => typeof f.id === 'string' ? f.id : String(f.id)))
			)
		}
		setIsExpanded(!isExpanded)
	}, [isExpanded, displayFolders])

	function toggleFolder(folderId: string) {
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

	async function handleFolderRename(id: string, newName: string) {
		try {
			await updateFolder(id, { name: newName })
		} catch (error) {
			console.error('Failed to rename folder:', error)
		}
	}

	async function handleFolderDelete(id: string) {
		try {
			await destroyFolder(id)
		} catch (error) {
			console.error('Failed to delete folder:', error)
		}
	}

	async function handleFolderMove(
		folderId: string,
		targetFolderId: string | null
	) {
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

	async function handleNoteRename(id: string, newName: string) {
		try {
			await updateNote(id, { title: newName })
		} catch (error) {
			console.error('Failed to rename note:', error)
		}
	}

	async function handleNoteDelete(id: string) {
		try {
			await destroyNote(id)
			if (activeFile === id) {
				setActiveFile(null)
 				onNoteSelect?.(null as unknown as string)
			}
		} catch (error) {
			console.error('Failed to delete note:', error)
		}
	}

	async function handleNoteDuplicate(id: string) {
		try {
			const result = await duplicateNote({ noteId: id, notes })
			if (result?.id && onNoteDuplicate) {
				setTimeout(() => {
					onNoteDuplicate(result.id)
				}, 100)
			}
		} catch (error) {
			console.error('Failed to duplicate note:', error)
		}
	}

	async function handleNoteMove(noteId: string, folderId: string | null) {
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

	async function handleNotePin(noteId: string, pinned: boolean) {
		try {
			await pinNote({ noteId, notes, pinned })
			if (pinned) {
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

	function handleDragStart(type: 'folder' | 'note', id: string) {
		if (type === 'folder') {
			dragState.startDragFolder(id)
		} else {
			dragState.startDragNote(id)
		}
	}

	function handleDragEnd() {
		dragState.endDrag()
		dragState.clearDragOver()
		setFocusedIndex(-1)
	}

	function handleDragOver(
		folderId: string,
		position: 'before' | 'after' | 'inside'
	) {
		if (dragState.draggedFolderId === folderId) return
		dragState.setDragOver(folderId, position)
	}

	function handleDragLeave() {
		dragState.clearDragOver()
	}

	async function handleDrop(
		targetFolderId: string,
		position: 'before' | 'after' | 'inside'
	) {
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
		dragState.clearDragOver()
		setFocusedIndex(-1)
	}

	function handleDragOverRoot(e: React.DragEvent) {
		if (!dragState.draggedNoteId && !dragState.draggedFolderId) return
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
		dragState.setDragOverRoot(true)
	}

	function handleDragLeaveRoot() {
		dragState.setDragOverRoot(false)
	}

	async function handleDropOnRoot(e: React.DragEvent) {
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
		dragState.clearDragOver()
		setFocusedIndex(-1)
	}

	async function handleNoteReorder(
		draggedNoteId: string,
		targetNoteId: string,
		position: 'before' | 'after'
	) {
		try {
			await reorderNote({ draggedNoteId, targetNoteId, position, notes })
		} catch (error) {
			console.error('Failed to reorder note:', error)
		}
		dragState.endDrag()
		dragState.clearDragOver()
		setFocusedIndex(-1)
	}

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
				const folderId = typeof folder.id === 'string' ? folder.id : String(folder.id)
				items.push({
					type: 'folder',
					id: folderId,
					name: folder.name,
					level
				})

				if (openFolders.has(folderId)) {
					const subFolders = getSubFolders(folderId)
					if (subFolders.length > 0) {
						addFolderItems(subFolders, level + 1)
					}

					const folderNotes = getFolderNotes(folderId)
					folderNotes.forEach(note => {
						const noteId = typeof note.id === 'string' ? note.id : String(note.id)
						items.push({
							type: 'note',
							id: noteId,
							name: note.title,
							level: level + 1
						})
					})
				}
			})
		}

		addFolderItems(displayFolders)

		displayNotes.forEach(noteData => {
			const note = 'item' in noteData ? noteData.item : noteData
			const noteId = typeof note.id === 'string' ? note.id : String(note.id)
			items.push({
				type: 'note',
				id: noteId,
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

	const getFocusedItem = useCallback(() => {
		const items = getFlatItemsList()
		if (focusedIndex >= 0 && focusedIndex < items.length) {
			return items[focusedIndex]
		}
		return null
	}, [focusedIndex, getFlatItemsList])

	const focusedItem = getFocusedItem()

	const isItemFocused = useCallback(
		(type: 'folder' | 'note', id: string) => {
			return focusedItem?.type === type && focusedItem?.id === id
		},
		[focusedItem]
	)

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
			<div
				className={cn(
					'h-full w-1 border-r cursor-col-resize absolute top-0 right-0 z-10',
					'hover:bg-foreground/10 hover:delay-75 transition-all duration-200',
					'active:bg-foreground/20 active:cursor-col-resize!'
				)}
				role="presentation"
			/>

			<ActionBar
				isExpanded={isExpanded}
				onExpandToggle={handleExpandToggle}
				onNoteCreate={onNoteCreate}
			/>

			<div
				ref={treeRef}
				className={cn(
					'flex flex-col items-start gap-1 w-full px-2 h-full overflow-auto pt-2 pb-4'
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
					const folderId = typeof folder.id === 'string' ? folder.id : String(folder.id)
					const folderFiles = getFolderNotes(folderId)
					const folderSubFolders = getSubFolders(folderId)
					const folderChildrenCount = getChildrenCount(folderId)

					return (
						<FolderItem
							key={folderId}
							id={folderId}
							name={folder.name}
							path={folder.path || `/${folder.name}`}
							files={folderFiles}
							subFolders={folderSubFolders}
							childrenCount={folderChildrenCount}
							activeFile={activeFile || undefined}
							onFileClick={note => {
								const noteId = typeof note.id === 'string' ? note.id : String(note.id)
								handleNoteClick(noteId)
							}}
							onFolderRename={handleFolderRename}
							isOpen={openFolders.has(folderId)}
							onToggle={() => toggleFolder(folderId)}
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
							isDragged={dragState.draggedFolderId === folderId}
							isDragOver={
								dragState.dragOverFolderId === folderId
							}
							dropPosition={
								dragState.dragOverFolderId === folderId
									? dragState.dropPosition
									: null
							}
							onDragStart={() =>
								handleDragStart('folder', folderId)
							}
							onDragEnd={handleDragEnd}
							onDragOver={position =>
								handleDragOver(folderId, position)
							}
							onDragLeave={handleDragLeave}
							onDrop={position => handleDrop(folderId, position)}
							onNoteReorder={handleNoteReorder}
							onNoteRename={handleNoteRename}
							onNoteDelete={handleNoteDelete}
							onNoteDuplicate={handleNoteDuplicate}
							onNoteMove={(noteId, folderId) => handleNoteMove(noteId, folderId ?? null)}
							onNotePin={handleNotePin}
							onFolderDelete={handleFolderDelete}
							onFolderMove={handleFolderMove}
							isFocused={isItemFocused('folder', folderId)}
							onFocus={() => handleItemFocus('folder', folderId)}
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
							onNoteMove={(noteId, folderId) => handleNoteMove(noteId, folderId ?? null)}
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
