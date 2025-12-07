import { Block } from '@blocknote/core'
import { useState, useCallback, useEffect, startTransition, useDeferredValue } from 'react'

import { readOne } from '@/lib/storage/client'

import { createFolder as createFolderMutation } from '../api/mutations/create-folder'
import { createNote as createNoteMutation } from '../api/mutations/create-note'
import { deleteItem as deleteItemMutation } from '../api/mutations/delete-item'
import { favoriteNote as favoriteNoteMutation } from '../api/mutations/favorite-note'
import { moveItem as moveItemMutation } from '../api/mutations/move-item'
import { pinItem as pinItemMutation } from '../api/mutations/pin-item'
import { renameItem as renameItemMutation } from '../api/mutations/rename-item'
import { updateNote as updateNoteMutation } from '../api/mutations/update-note'
import { getItems, invalidateItemsCache } from '../api/queries/get-items'
import { getNote as getNoteQuery } from '../api/queries/get-note'

import type { Note, Folder, Item } from '../types'

const STORAGE_KEY = 'Skriuw_notes'

/**
 * Enhanced useNotes hook with non-blocking updates and loading states
 * Supports concurrent rendering and prevents layout shifts
 */
export function useNotesWithSuspense() {
	const [items, setItems] = useState<Item[]>([])
	const [isInitialLoading, setIsInitialLoading] = useState(true)
	const [isRefreshing, setIsRefreshing] = useState(false)

	// Deferred valure for non-blocking updates
	const deferredItems = useDeferredValue(items)

	// Initial load
	useEffect(() => {
		let isCancelled = false

		const loadInitialData = async () => {
			try {
				const data = await getItems()
				if (!isCancelled) {
					setItems(data)
					setIsInitialLoading(false)
				}
			} catch (error) {
				console.error('Failed to load notes:', error)
				if (!isCancelled) {
					setIsInitialLoading(false)
				}
			}
		}

		loadInitialData()

		return () => {
			isCancelled = true
		}
	}, [])

	const refreshItems = useCallback(async () => {
		setIsRefreshing(true)
		try {
			invalidateItemsCache()
			const updatedItems = await getItems({ forceRefresh: true })
			// Use startTransition to make this update non-blocking
			startTransition(() => {
				setItems(updatedItems)
				setIsRefreshing(false)
			})
		} catch (error) {
			console.error('Failed to refresh items:', error)
			setIsRefreshing(false)
		}
	}, [])

	const getNote = useCallback(async (id: string): Promise<Note | undefined> => {
		return await getNoteQuery(id)
	}, [])

	const getItem = useCallback(async (id: string): Promise<Item | undefined> => {
		const result = await readOne<Item>(STORAGE_KEY, id)
		if (result.success && result.data && 'id' in result.data) {
			return result.data
		}
		return undefined
	}, [])

	const createNote = useCallback(
		async (name: string = 'Untitled', parentFolderId?: string) => {
			// Generate temporary ID for optimistic update
			const tempId = `temp-note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
			const now = Date.now()

			// Create optimistic note
			const optimisticNote: Note = {
				id: tempId,
				name,
				type: 'note',
				content: [],
				parentFolderId,
				pinned: false,
				favorite: false,
				createdAt: now,
				updatedAt: now,
			}

			// Optimistically add to UI immediately
			const previousItems = items
			const addItem = (itemList: Item[], item: Item, targetFolderId?: string): Item[] => {
				if (!targetFolderId) {
					return [...itemList, item]
				}
				return itemList.map((i) => {
					if (i.id === targetFolderId && i.type === 'folder') {
						return { ...i, children: [...i.children, item] }
					}
					if (i.type === 'folder') {
						return { ...i, children: addItem(i.children, item, targetFolderId) }
					}
					return i
				})
			}
			setItems(addItem(items, optimisticNote, parentFolderId))

			try {
				// Create on server
				const newNote = await createNoteMutation({ name, parentFolderId })

				// Replace temp note with real note
				const replaceItem = (itemList: Item[]): Item[] => {
					return itemList.map((i) => {
						if (i.id === tempId) {
							return newNote
						}
						if (i.type === 'folder') {
							return { ...i, children: replaceItem(i.children) }
						}
						return i
					})
				}
				setItems(replaceItem)
				return newNote
			} catch (error) {
				// Rollback on failure
				setItems(previousItems)
				console.error('Failed to create note:', error)
				throw error
			}
		},
		[items]
	)

	const createFolder = useCallback(
		async (name: string = 'New Folder', parentFolderId?: string) => {
			// Generate temporary ID for optimistic update
			const tempId = `temp-folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
			const now = Date.now()

			// Create optimistic folder
			const optimisticFolder: Folder = {
				id: tempId,
				name,
				type: 'folder',
				children: [],
				parentFolderId,
				pinned: false,
				createdAt: now,
				updatedAt: now,
			}

			// Optimistically add to UI immediately
			const previousItems = items
			const addItem = (itemList: Item[], item: Item, targetFolderId?: string): Item[] => {
				if (!targetFolderId) {
					return [...itemList, item]
				}
				return itemList.map((i) => {
					if (i.id === targetFolderId && i.type === 'folder') {
						return { ...i, children: [...i.children, item] }
					}
					if (i.type === 'folder') {
						return { ...i, children: addItem(i.children, item, targetFolderId) }
					}
					return i
				})
			}
			setItems(addItem(items, optimisticFolder, parentFolderId))

			try {
				// Create on server
				const newFolder = await createFolderMutation({ name, parentFolderId })

				// Replace temp folder with real folder (preserving children structure)
				const replaceItem = (itemList: Item[]): Item[] => {
					return itemList.map((i) => {
						if (i.id === tempId) {
							return { ...newFolder, children: [] }
						}
						if (i.type === 'folder') {
							return { ...i, children: replaceItem(i.children) }
						}
						return i
					})
				}
				setItems(replaceItem)
				return newFolder
			} catch (error) {
				// Rollback on failure
				setItems(previousItems)
				console.error('Failed to create folder:', error)
				throw error
			}
		},
		[items]
	)

	const updateNote = useCallback(
		async (id: string, content: Block[], name?: string) => {
			await updateNoteMutation(id, { content, name })
			// Non-blocking refresh
			refreshItems()
		},
		[refreshItems]
	)

	const renameItem = useCallback(
		async (id: string, newName: string) => {
			// Optimistic update: rename item immediately
			const previousItems = items
			const updateName = (itemList: Item[]): Item[] => {
				return itemList.map((item) => {
					if (item.id === id) {
						return { ...item, name: newName }
					}
					if (item.type === 'folder') {
						return { ...item, children: updateName(item.children) }
					}
					return item
				})
			}
			setItems(updateName(items))

			try {
				await renameItemMutation(id, newName)
			} catch (error) {
				setItems(previousItems)
				console.error('Failed to rename item:', error)
			}
		},
		[items]
	)

	const deleteItem = useCallback(
		async (id: string) => {
			// Optimistic update: remove item from UI immediately
			const previousItems = items
			const removeItemById = (itemList: Item[]): Item[] => {
				return itemList
					.filter((item) => item.id !== id)
					.map((item) => {
						if (item.type === 'folder') {
							return { ...item, children: removeItemById(item.children) }
						}
						return item
					})
			}
			setItems(removeItemById(items))

			// Perform actual deletion in background
			try {
				const success = await deleteItemMutation(id)
				if (!success) {
					// Rollback on failure
					setItems(previousItems)
					return false
				}
				return true
			} catch (error) {
				// Rollback on error
				setItems(previousItems)
				console.error('Failed to delete item:', error)
				return false
			}
		},
		[items]
	)

	const moveItem = useCallback(
		async (itemId: string, targetFolderId: string | null) => {
			// Optimistic update: move item in UI immediately
			const previousItems = items
			let movedItem: Item | null = null

			// Find and remove the item from its current location
			const removeItem = (itemList: Item[]): Item[] => {
				return itemList
					.filter((item) => {
						if (item.id === itemId) {
							movedItem = item
							return false
						}
						return true
					})
					.map((item) => {
						if (item.type === 'folder') {
							return { ...item, children: removeItem(item.children) }
						}
						return item
					})
			}

			// Add item to target folder
			const addToTarget = (itemList: Item[]): Item[] => {
				if (!movedItem) return itemList
				if (targetFolderId === null) {
					return [...itemList, movedItem]
				}
				return itemList.map((item) => {
					if (item.id === targetFolderId && item.type === 'folder') {
						return { ...item, children: [...item.children, movedItem!] }
					}
					if (item.type === 'folder') {
						return { ...item, children: addToTarget(item.children) }
					}
					return item
				})
			}

			const withoutItem = removeItem(items)
			if (movedItem) {
				setItems(addToTarget(withoutItem))
			}

			// Perform actual move in background
			try {
				const success = await moveItemMutation(itemId, targetFolderId)
				if (!success) {
					setItems(previousItems)
					return false
				}
				return true
			} catch (error) {
				setItems(previousItems)
				console.error('Failed to move item:', error)
				return false
			}
		},
		[items]
	)

	const countChildren = useCallback(async (folderId: string): Promise<number> => {
		const result = await readOne<Folder>(STORAGE_KEY, folderId)
		if (
			result.success &&
			result.data &&
			'children' in result.data &&
			Array.isArray(result.data.children)
		) {
			return result.data.children.length
		}
		return 0
	}, [])

	const pinItem = useCallback(
		async (itemId: string, itemType: 'note' | 'folder', pinned: boolean) => {
			// Optimistic update: update pin status immediately
			const previousItems = items
			const updatePinStatus = (itemList: Item[]): Item[] => {
				return itemList.map((item) => {
					if (item.id === itemId) {
						return { ...item, pinned, pinnedAt: pinned ? Date.now() : undefined }
					}
					if (item.type === 'folder') {
						return { ...item, children: updatePinStatus(item.children) }
					}
					return item
				})
			}
			setItems(updatePinStatus(items))

			try {
				await pinItemMutation(itemId, itemType, pinned)
			} catch (error) {
				setItems(previousItems)
				console.error('Failed to pin item:', error)
			}
		},
		[items]
	)

	const favoriteNote = useCallback(
		async (noteId: string, favorite: boolean) => {
			// Optimistic update: update favorite status immediately
			const previousItems = items
			const updateFavoriteStatus = (itemList: Item[]): Item[] => {
				return itemList.map((item) => {
					if (item.id === noteId && item.type === 'note') {
						return { ...item, favorite }
					}
					if (item.type === 'folder') {
						return { ...item, children: updateFavoriteStatus(item.children) }
					}
					return item
				})
			}
			setItems(updateFavoriteStatus(items))

			try {
				await favoriteNoteMutation(noteId, favorite)
			} catch (error) {
				setItems(previousItems)
				console.error('Failed to favorite note:', error)
			}
		},
		[items]
	)

	return {
		items: deferredItems,
		isInitialLoading,
		isRefreshing,
		getNote,
		getItem,
		createNote,
		createFolder,
		updateNote,
		renameItem,
		deleteItem,
		moveItem,
		countChildren,
		pinItem,
		favoriteNote,
		refreshItems,
	}
}
