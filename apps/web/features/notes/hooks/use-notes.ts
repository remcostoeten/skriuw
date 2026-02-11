import type { Note, Folder, Item } from '../types'
import { stringToBlocks } from '../utils/string-to-blocks'
import { getInitialNoteContent, type NoteTemplate } from '../utils/get-initial-note-content'
import {
	useNotesQuery,
	useNoteQuery,
	useCreateNoteMutation,
	useCreateFolderMutation,
	useUpdateNoteMutation,
	useDeleteMutation,
	useMoveItemMutation,
	useRenameItemMutation,
	usePinItemMutation,
	useFavoriteNoteMutation,
	useSetNoteVisibilityMutation
} from './use-notes-query'
import { Block } from '@blocknote/core'
import { useCallback } from 'react'
import { useSettings } from '../../settings/use-settings'

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

	// 2. Settings for note experience
	const { getSetting } = useSettings()

	// 3. Mutations
	const createNoteMutation = useCreateNoteMutation()
	const createFolderMutation = useCreateFolderMutation()
	const updateNoteMutation = useUpdateNoteMutation()
	const deleteMutation = useDeleteMutation()
	const moveItemMutation = useMoveItemMutation()
	const renameItemMutation = useRenameItemMutation()
	const pinItemMutation = usePinItemMutation()
	const favoriteNoteMutation = useFavoriteNoteMutation()
	const setVisibilityMutation = useSetNoteVisibilityMutation()

	// Helper function to find an item in the tree (used by multiple functions)
	const findItemInTree = useCallback(
		(id: string): Item | undefined => {
			const search = (list: Item[]): Item | undefined => {
				for (const item of list) {
					if (item.id === id) return item
					if (item.type === 'folder') {
						const found = search((item as Folder).children)
						if (found) return found
					}
				}
				return undefined
			}
			return search(items)
		},
		[items]
	)

	// Helper to find a note specifically
	const findNoteInTree = useCallback(
		(id: string): Note | undefined => {
			const item = findItemInTree(id)
			return item?.type === 'note' ? (item as Note) : undefined
		},
		[findItemInTree]
	)

	// 4. Wrappers to match original API signature
	const createNote = useCallback(
		async (
			name?: string,
			content?: string | Block[],
			parentFolderId?: string,
			options?: {
				template?: NoteTemplate
				icon?: string
				tags?: string[]
			}
		) => {
			// Get note experience settings
			const noteCreationMode = getSetting('noteCreationMode') ?? 'rich'
			const defaultEmoji = getSetting('defaultEmoji') ?? ''
			const titlePlaceholder = getSetting('titlePlaceholder') ?? 'Untitled Note'
			const minimalNoteHeader = getSetting('minimalNoteHeader') ?? false
			const titleInEditor = getSetting('titleInEditor') ?? false
			const disableTemplates = getSetting('disableTemplates') ?? false
			const defaultTemplate = (getSetting('defaultNoteTemplate') ?? 'empty') as NoteTemplate
			const autoIconFromFolder = getSetting('autoIconFromFolder') ?? false

			// Determine content: explicit content > template > default template
			let noteContent: Block[]
			if (content) {
				noteContent = typeof content === 'string' ? stringToBlocks(content) : content
			} else {
				// Fix for Issue 7: Respect disableTemplates setting
				const templateToUse = disableTemplates
					? 'empty'
					: (options?.template ??
						((minimalNoteHeader || titleInEditor) && defaultTemplate === 'empty'
							? 'h1'
							: defaultTemplate))
				noteContent = getInitialNoteContent(templateToUse)
			}

			// Determine icon: explicit icon > option icon > folder icon (if enabled) > default emoji
			let noteIcon = options?.icon
			if (!noteIcon && autoIconFromFolder && parentFolderId) {
				// Try to get parent folder's icon
				const parentFolder = findItemInTree(parentFolderId)
				if (parentFolder?.type === 'folder' && (parentFolder as any).icon) {
					noteIcon = (parentFolder as any).icon
				}
			}
			if (!noteIcon && defaultEmoji) {
				noteIcon = defaultEmoji
			}

			const coverImage = noteCreationMode === 'simple' ? undefined : undefined

			return await createNoteMutation.mutateAsync({
				name: name ?? titlePlaceholder,
				content: noteContent,
				parentFolderId,
				icon: noteIcon,
				coverImage,
				tags: options?.tags
			})
		},
		[createNoteMutation, getSetting, findItemInTree]
	)

	const duplicateNote = useCallback(
		async (noteId: string, newName?: string) => {
			const sourceNote = findNoteInTree(noteId)
			if (!sourceNote) {
				throw new Error('Note not found')
			}

			const duplicatedName = newName ?? `${sourceNote.name} (copy)`

			return await createNoteMutation.mutateAsync({
				name: duplicatedName,
				content: sourceNote.content || [],
				parentFolderId: sourceNote.parentFolderId,
				icon: sourceNote.icon,
				coverImage: sourceNote.coverImage,
				tags: sourceNote.tags
			})
		},
		[createNoteMutation, findNoteInTree]
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
		async (
			id: string,
			content?: Block[],
			name?: string,
			icon?: string,
			tags?: string[],
			coverImage?: string
		) => {
			return await updateNoteMutation.mutateAsync({
				id,
				content,
				name,
				icon,
				tags,
				coverImage
			})
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

	// getNote and getItem - use the tree helpers for cache-first lookup
	const getItem = useCallback(
		async (id: string): Promise<Item | undefined> => {
			return findItemInTree(id)
		},
		[findItemInTree]
	)

	const getNote = useCallback(
		async (id: string): Promise<Note | undefined> => {
			return findNoteInTree(id)
		},
		[findNoteInTree]
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
		setNoteVisibility,
		duplicateNote
	}
}
