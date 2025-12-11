import { Block } from '@blocknote/core'
import { useState, useCallback, startTransition, useDeferredValue } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { readOne } from '@skriuw/crud'

import { createFolder as createFolderMutation } from '../api/mutations/create-folder'
import { createNote as createNoteMutation } from '../api/mutations/create-note'
import { deleteItem as deleteItemMutation } from '../api/mutations/delete-item'
import { favoriteNote as favoriteNoteMutation } from '../api/mutations/favorite-note'
import { moveItem as moveItemMutation } from '../api/mutations/move-item'
import { pinItem as pinItemMutation } from '../api/mutations/pin-item'
import { renameItem as renameItemMutation } from '../api/mutations/rename-item'
import { updateNote as updateNoteMutation } from '../api/mutations/update-note'
import { getItems } from '../api/queries/get-items'
import { getNote as getNoteQuery } from '../api/queries/get-note'
import { getPrefetchedNote, addToPrefetchCache } from './use-prefetch'

import type { Note, Folder, Item } from '../types'

import { STORAGE_KEYS } from '@/lib/storage-keys'

// Query key for notes - used for cache invalidation
export const NOTES_QUERY_KEY = ['notes'] as const

/**
 * Enhanced useNotes hook with React Query for caching and deduplication.
 * Keeps optimistic updates for fast UI feedback.
 */
export function useNotes() {
	const queryClient = useQueryClient()

	// React Query handles fetching, caching, deduplication, and background refresh
	const { data: items = [], isLoading: isInitialLoading, isFetching: isRefreshing } = useQuery({
		queryKey: NOTES_QUERY_KEY,
		queryFn: () => getItems(),
		staleTime: 60 * 1000, // Consider data fresh for 1 minute
	})

	// Local state for optimistic updates (synced from React Query)
	const [optimisticItems, setOptimisticItems] = useState<Item[] | null>(null)

	// Use optimistic items if available, otherwise use query data
	const displayItems = optimisticItems ?? items

	// Deferred value for non-blocking updates
	const deferredItems = useDeferredValue(displayItems)

	// Invalidate and refetch
	const refreshItems = useCallback(async () => {
		setOptimisticItems(null) // Clear optimistic state
		await queryClient.invalidateQueries({ queryKey: NOTES_QUERY_KEY })
	}, [queryClient])

	const getNote = useCallback(async (id: string): Promise<Note | undefined> => {
		// Check prefetch cache first
		const cachedNote = getPrefetchedNote(id)
		if (cachedNote) {
			return cachedNote
		}

		// Fetch from API
		const note = await getNoteQuery(id)
		if (note) {
			// Add to shared prefetch cache
			addToPrefetchCache(id, note)
		}

		return note
	}, [])

	const getItem = useCallback(async (id: string): Promise<Item | undefined> => {
		const result = await readOne<Item>(STORAGE_KEYS.NOTES, id)
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
			setOptimisticItems(addItem(items, optimisticNote, parentFolderId))

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
				setOptimisticItems(replaceItem)
				return newNote
			} catch (error) {
				// Rollback on failure
				setOptimisticItems(previousItems)
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
			setOptimisticItems(addItem(items, optimisticFolder, parentFolderId))

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
				setOptimisticItems(replaceItem)
				return newFolder
			} catch (error) {
				// Rollback on failure
				setOptimisticItems(previousItems)
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
			setOptimisticItems(updateName(items))

			try {
				await renameItemMutation(id, newName)
			} catch (error) {
				setOptimisticItems(previousItems)
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
			setOptimisticItems(removeItemById(items))

			// Perform actual deletion in background
			try {
				const success = await deleteItemMutation(id)
				if (!success) {
					// Rollback on failure
					setOptimisticItems(previousItems)
					return false
				}
				return true
			} catch (error) {
				// Rollback on error
				setOptimisticItems(previousItems)
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
				setOptimisticItems(addToTarget(withoutItem))
			}

			// Perform actual move in background
			try {
				const success = await moveItemMutation(itemId, targetFolderId)
				if (!success) {
					setOptimisticItems(previousItems)
					return false
				}
				return true
			} catch (error) {
				setOptimisticItems(previousItems)
				console.error('Failed to move item:', error)
				return false
			}
		},
		[items]
	)

	const countChildren = useCallback(async (folderId: string): Promise<number> => {
		const result = await readOne<Folder>(STORAGE_KEYS.NOTES, folderId)
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
			setOptimisticItems(updatePinStatus(items))

			try {
				await pinItemMutation(itemId, itemType, pinned)
			} catch (error) {
				setOptimisticItems(previousItems)
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
			setOptimisticItems(updateFavoriteStatus(items))

			try {
				await favoriteNoteMutation(noteId, favorite)
			} catch (error) {
				setOptimisticItems(previousItems)
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
