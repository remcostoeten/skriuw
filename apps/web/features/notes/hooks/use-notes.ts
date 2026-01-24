import type { Note, Folder, Item } from "../types";
import { stringToBlocks } from "../utils/string-to-blocks";
import { useNotesQuery, useNoteQuery, useCreateNoteMutation, useCreateFolderMutation, useUpdateNoteMutation, useDeleteMutation, useMoveItemMutation, useRenameItemMutation, usePinItemMutation, useFavoriteNoteMutation, useSetNoteVisibilityMutation } from "./use-notes-query";
import { Block } from "@blocknote/core";
import { useCallback } from "react";

/**

 * Hook for managing notes and folders with optimistic updates and non-blocking state changes.
 *
 * Provides a complete API for CRUD operations on notes and folders, with built-in
 * optimistic updates for instant UI feedback. Uses React's concurrent features like
 * `startTransition` and `useDeferredValue` to prevent blocking the UI during updates.
 *
 * @returns An object containing:
 * - `items`: Array of all notes and folders (deferred for non-blocking updates)
 * - `isInitialLoading`: Boolean indicating if data is being loaded for the first time
 * - `isRefreshing`: Boolean indicating if data is being refreshed
 * - `getNote`: Function to fetch a note by ID
 * - `getItem`: Function to fetch any item (note or folder) by ID
 * - `createNote`: Function to create a new note
 * - `createFolder`: Function to create a new folder
 * - `updateNote`: Function to update a note's content and/or name
 * - `renameItem`: Function to rename a note or folder
 * - `deleteItem`: Function to delete a note or folder
 * - `moveItem`: Function to move an item to a different folder
 * - `countChildren`: Function to count children in a folder
 * - `pinItem`: Function to pin or unpin an item
 * - `favoriteNote`: Function to favorite or unfavorite a note
 * - `refreshItems`: Function to manually refresh the items list
 *
 * @example
 * ```tsx
 * // Using directly (creates its own state instance)
 * function MyComponent() {
 *   const { items, createNote, isInitialLoading } = useNotes()
 *
 *   if (isInitialLoading) return <div>Loading...</div>
 *
 *   return (
 *     <div>
 *       {items.map(item => (
 *         <div key={item.id}>{item.name}</div>
 *       ))}
 *       <button onClick={() => createNote('New Note')}>
 *         Create Note
 *       </button>
 *     </div>
 *   )
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Using via context (shares state across components)
 * function MyComponent() {
 *   const { items, createNote } = useNotesContext()
 *
 *   return (
 *     <div>
 *       {items.map(item => (
 *         <div key={item.id}>{item.name}</div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Optimistic updates example
 * function NoteEditor({ noteId }: { noteId: string }) {
 *   const { updateNote, getNote } = useNotesContext()
 *   const [content, setContent] = useState<Block[]>([])
 *
 *   const handleSave = async () => {
 *     // UI updates immediately, server sync happens in background
 *     await updateNote(noteId, content, 'Updated Title')
 *   }
 *
 *   return (
 *     <div>
 *       {/ * Editor UI * /}
 *       <button onClick={handleSave}>Save</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useNotes() {
	// 1. Fetch data
	const {
		data: items = [],
		isLoading: isInitialLoading,
		isRefetching: isRefreshing,
		refetch
	} = useNotesQuery()

	// 2. Mutations
	const createNoteMutation = useCreateNoteMutation()
	const createFolderMutation = useCreateFolderMutation()
	const updateNoteMutation = useUpdateNoteMutation()
	const deleteMutation = useDeleteMutation()
	const moveItemMutation = useMoveItemMutation()
	const renameItemMutation = useRenameItemMutation()
	const pinItemMutation = usePinItemMutation()
	const favoriteNoteMutation = useFavoriteNoteMutation()
	const setVisibilityMutation = useSetNoteVisibilityMutation()

	// 3. Wrappers to match original API signature
	const createNote = useCallback(
		async (name?: string, content?: string | Block[], parentFolderId?: string) => {
			// Handle content conversion if string
			const noteContent: Block[] =
				typeof content === 'string' ? stringToBlocks(content) : content || []

			return await createNoteMutation.mutateAsync({
				name: name ?? 'Untitled Note',
				content: noteContent,
				parentFolderId
			})
		},
		[createNoteMutation]
	)

	const createFolder = useCallback(
		async (name?: string, parentFolderId?: string) => {
			return await createFolderMutation.mutateAsync({
				name: name ?? 'New Folder',
				parentFolderId
			})
		},
		[createFolderMutation]
	)

	const updateNote = useCallback(
		async (id: string, content?: Block[], name?: string, icon?: string, tags?: string[], coverImage?: string) => {
			return await updateNoteMutation.mutateAsync({ id, content, name, icon, tags, coverImage })
		},
		[updateNoteMutation]
	)

	const deleteItem = useCallback(
		async (id: string) => {
			return await deleteMutation.mutateAsync(id)
		},
		[deleteMutation]
	)

	const moveItem = useCallback(
		async (itemId: string, targetFolderId: string | null | undefined) => {
			return await moveItemMutation.mutateAsync({
				itemId,
				targetFolderId: targetFolderId ?? null
			})
		},
		[moveItemMutation]
	)

	const renameItem = useCallback(
		async (id: string, newName: string) => {
			return await renameItemMutation.mutateAsync({ id, name: newName })
		},
		[renameItemMutation]
	)

	const pinItem = useCallback(
		async (itemId: string, itemType: 'note' | 'folder', pinned: boolean) => {
			return await pinItemMutation.mutateAsync({ id: itemId, pinned })
		},
		[pinItemMutation]
	)

	const favoriteNote = useCallback(
		async (noteId: string, favorite: boolean) => {
			return await favoriteNoteMutation.mutateAsync({ id: noteId, favorite })
		},
		[favoriteNoteMutation]
	)

	const setNoteVisibility = useCallback(
		async (noteId: string, isPublic: boolean) => {
			return await setVisibilityMutation.mutateAsync({ id: noteId, isPublic })
		},
		[setVisibilityMutation]
	)

	const refreshItems = useCallback(async () => {
		await refetch()
	}, [refetch])

	// Legacy helpers that might still be needed
	// countChildren was used in UI, can be derived from items now without async
	const countChildren = useCallback(
		async (folderId: string): Promise<number> => {
			// This is inefficient to do async if we have all items, but keeping signature compatible
			// Better implementation would be synchronous lookup if we have the tree
			const findFolder = (list: Item[]): Folder | undefined => {
				for (const item of list) {
					if (item.id === folderId && item.type === 'folder') return item as Folder
					if (item.type === 'folder') {
						const found = findFolder((item as Folder).children)
						if (found) return found
					}
				}
				return undefined
			}
			const folder = findFolder(items)
			return folder?.children?.length ?? 0
		},
		[items]
	)

	// getNote and getItem are slightly different - they fetch fresh
	// But usage in app might expect them to check cache first.
	// The useNoteQuery hook handles specific single note requirements,
	// but the original `getNote` was an imperative async call.
	// We can bridge this by using queryClient.fetchQuery or just keeping the original API query usage
	// wrapped in a promise if needed.
	// Ideally components switch to `useNoteQuery(id)`, but for now:

	// We need access to direct queries for imperative calls
	// Since we can't easily hookify imperative calls without direct client access
	// We will leave getNote/getItem as async fetchers that might bypass RQ cache for now
	// OR we use the queryClient to fetch.

	// For this refactor step, let's keep it simple: relying on the list for `getItem` if possible
	// or falling back to a fetch if not found, to mimic "cache first".

	const getItem = useCallback(
		async (id: string): Promise<Item | undefined> => {
			const findItem = (list: Item[]): Item | undefined => {
				for (const item of list) {
					if (item.id === id) return item
					if (item.type === 'folder') {
						const found = findItem((item as Folder).children)
						if (found) return found
					}
				}
				return undefined
			}
			return findItem(items)
		},
		[items]
	)

	const getNote = useCallback(
		async (id: string): Promise<Note | undefined> => {
			const item = await getItem(id)
			return item?.type === 'note' ? (item as Note) : undefined
		},
		[getItem]
	)

	return {
		items, // deferredItems removed, RQ handles concurrency usually well enough or we add it back if UI laggy
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
		setNoteVisibility
	}
}
