import type { Item, Note, Folder } from "../types";
import { extractTasksFromBlocks } from "../utils/extract-tasks";
import { trackActivity } from "@/features/activity";
import { useSession } from "@/lib/auth-client";
import { getWelcomeContent } from "@/lib/seed-content/welcome";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { readMany, readOne, create, update, destroy } from "@skriuw/crud";
import { generateId } from "@skriuw/shared";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

// Keys factory for query invalidation
export const notesKeys = {
	all: ['notes'] as const,
	lists: () => [...notesKeys.all, 'list'] as const,
	list: (userId: string | undefined) => [...notesKeys.lists(), { userId }] as const,
	details: () => [...notesKeys.all, 'detail'] as const,
	detail: (id: string) => [...notesKeys.details(), id] as const
}

// -----------------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------------

/**
 * Fetch all items (notes + folders) and filter out soft-deleted ones.
 */
export function useNotesQuery() {
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'
	const queryClient = useQueryClient()

	useEffect(() => {
		if (typeof window === 'undefined') return
		if (userId !== 'guest' && userId !== 'guest-user') return

		const hasData = localStorage.getItem(STORAGE_KEYS.NOTES)
		const hasSeeded = localStorage.getItem('skriuw:welcome_seeded')

		if ((!hasData || hasData === '[]') && !hasSeeded) {
			const now = Date.now()
			const welcomeNote: Note = {
				id: `welcome-${now}`,
				name: 'Your workspace is ready',
				type: 'note',
				content: getWelcomeContent(),
				parentFolderId: undefined,
				pinned: true,
				favorite: false,
				createdAt: now,
				updatedAt: now,
				userId
			}

			localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify([welcomeNote]))
			localStorage.setItem('skriuw:welcome_seeded', 'true')
			queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
		}
	}, [userId, queryClient])

	return useQuery({
		queryKey: notesKeys.list(userId),
		queryFn: async () => {
			const result = await readMany<Item>(STORAGE_KEYS.NOTES, {
				userId
			})

			if (!result.success || !result.data) return []

			const allItems = Array.isArray(result.data) ? result.data : []
			return filterActiveItems(allItems)
		},
		staleTime: userId === 'guest' || userId === 'guest-user' ? 0 : 60 * 1000,
		refetchOnMount: userId === 'guest' || userId === 'guest-user' ? true : undefined
	})
}

/**
 * Fetch a single item (note or folder)
 */
export function useNoteQuery(id: string) {
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useQuery({
		queryKey: notesKeys.detail(id),
		queryFn: async () => {
			const result = await readOne<Item>(STORAGE_KEYS.NOTES, id, { userId })
			if (result.success && result.data && 'id' in result.data) {
				return result.data
			}
			return null
		},
		enabled: !!id
	})
}

// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------

export function useCreateNoteMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useMutation({
		mutationFn: async ({
			name,
			content,
			parentFolderId
		}: {
			name: string
			content: any[]
			parentFolderId?: string
		}) => {
			const newNote: Note = {
				id: generateId('temp-'), // will be overwritten by server/local
				name,
				type: 'note',
				content: content,
				parentFolderId,
				pinned: false,
				favorite: false,
				createdAt: Date.now(),
				updatedAt: Date.now()
			}

			const result = await create<Note>(STORAGE_KEYS.NOTES, newNote, { userId })
			if (!result.success || !result.data) throw new Error('Failed to create note')
			return result.data
		},
		onSuccess: (newNote) => {
			// Optimistically update list cache
			queryClient.setQueryData<Item[]>(notesKeys.list(userId), (old = []) => {
				const addItem = (items: Item[]): Item[] => {
					if (!newNote.parentFolderId) {
						return [...items, newNote]
					}

					// If adding to a folder, find it and append
					// Check if we are at root and parent is here (optimization/simplicity)
					// But we need to traverse
					if (!items || !Array.isArray(items)) return []
					const newItems = items.map((item) => {
						if (item.id === newNote.parentFolderId && item.type === 'folder') {
							return { ...item, children: [...(item.children || []), newNote] }
						}
						if (item.type === 'folder' && item.children) {
							return { ...item, children: addItem(item.children) }
						}
						return item
					})

					// If we traversed and didn't find the parent (maybe it's root?)
					// Logic above: recursively maps. If parent found, it adds.
					// If newNote.parentFolderId exists but we are at root call...
					// Wait, if parentFolderId is provided but not found?
					// Should we add to root? Or assume parent exists?
					// Safe cleanup: if parentFolderId is set but parent not found, technically it's orphaned.
					// But for our cache, we rely on the map.

					return newItems
				}

				if (newNote.parentFolderId) {
					return addItem(old)
				}
				return [...old, newNote]
			})

			// Invalidate list to refetch
			queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
		}
	})
}

export function useCreateFolderMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useMutation({
		mutationFn: async ({ name, parentFolderId }: { name: string; parentFolderId?: string }) => {
			const newFolder: Folder = {
				id: generateId('temp-'),
				name,
				type: 'folder',
				children: [],
				parentFolderId,
				pinned: false,
				createdAt: Date.now(),
				updatedAt: Date.now()
			}

			const result = await create<Folder>(STORAGE_KEYS.NOTES, newFolder, { userId })
			if (!result.success || !result.data) throw new Error('Failed to create folder')
			return result.data
		},
		onSuccess: (newFolder) => {
			// Optimistically update list cache
			queryClient.setQueryData<Item[]>(notesKeys.list(userId), (old = []) => {
				const addItem = (items: Item[]): Item[] => {
					if (!newFolder.parentFolderId) {
						return [...items, newFolder]
					}

					if (!items || !Array.isArray(items)) return []
					return items.map((item) => {
						if (item.id === newFolder.parentFolderId && item.type === 'folder') {
							return { ...item, children: [...(item.children || []), newFolder] }
						}
						if (item.type === 'folder' && item.children) {
							return { ...item, children: addItem(item.children) }
						}
						return item
					})
				}

				if (newFolder.parentFolderId) {
					return addItem(old)
				}
				return [...old, newFolder]
			})

			queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
		}
	})
}

export function useUpdateNoteMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useMutation({
		mutationFn: async ({
			id,
			content,
			name,
			icon,
			tags,
			coverImage
		}: {
			id: string
			content?: any[]
			name?: string
			icon?: string
			tags?: string[]
			coverImage?: string
		}) => {
			const updateData: Partial<Note> = {}
			if (content !== undefined) updateData.content = content
			if (name !== undefined) updateData.name = name
			if (icon !== undefined) updateData.icon = icon
			if (tags !== undefined) updateData.tags = tags
			if (coverImage !== undefined) updateData.coverImage = coverImage

			const result = await update<Note>(STORAGE_KEYS.NOTES, id, updateData, { userId })
			if (!result.success) throw new Error('Failed to update note')

			// Sync tasks if content was updated (parity with update-note.ts)
			if (content && Array.isArray(content)) {
				try {
					const extractedTasks = extractTasksFromBlocks(content, id)
					// Fire and forget - call /api/tasks/sync
					fetch('/api/tasks/sync', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ noteId: id, tasks: extractedTasks })
					}).catch(() => { })
				} catch (taskError) {
					// Don't fail note update if task sync fails
					console.error('Failed to sync tasks:', taskError)
				}
			}

			if (result.data && userId !== 'guest' && userId !== 'guest-user') {
				trackActivity({
					entityType: 'note',
					entityId: id,
					action: 'updated',
					entityName: result.data.name || 'Untitled'
				})
			}

			return result.data
		},
		onMutate: async (newNote) => {
			await queryClient.cancelQueries({ queryKey: notesKeys.list(userId) })
			const previousNotes = queryClient.getQueryData(notesKeys.list(userId))

			queryClient.setQueryData(notesKeys.list(userId), (old: Item[] = []) => {
				const updateItem = (items: Item[]): Item[] => {
					return items.map((item) => {
						if (item.id === newNote.id) {
							return { ...item, ...newNote, updatedAt: Date.now() }
						}
						if (item.type === 'folder') {
							return { ...item, children: updateItem(item.children) }
						}
						return item
					})
				}
				return updateItem(old)
			})

			return { previousNotes }
		},
		onError: (err, newNote, context) => {
			queryClient.setQueryData(notesKeys.list(userId), context?.previousNotes)
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
		}
	})
}

export function useDeleteMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useMutation({
		mutationFn: async (id: string) => {
			const result = await destroy(STORAGE_KEYS.NOTES, id, { userId })
			if (!result.success) throw new Error('Failed to delete item')
			return true
		},
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: notesKeys.list(userId) })
			const previousNotes = queryClient.getQueryData(notesKeys.list(userId))

			queryClient.setQueryData(notesKeys.list(userId), (old: Item[] = []) => {
				const removeItem = (items: Item[]): Item[] => {
					return items
						.filter((item) => item.id !== id)
						.map((item) => {
							if (item.type === 'folder') {
								return { ...item, children: removeItem(item.children) }
							}
							return item
						})
				}
				return removeItem(old)
			})

			return { previousNotes }
		},
		onError: (err, id, context) => {
			queryClient.setQueryData(notesKeys.list(userId), context?.previousNotes)
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
		}
	})
}

export function useMoveItemMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useMutation({
		mutationFn: async ({
			itemId,
			targetFolderId
		}: {
			itemId: string
			targetFolderId: string | null
		}) => {
			const updateData = {
				parentFolderId: targetFolderId === null ? undefined : targetFolderId
			} as Partial<Item>
			const result = await update<Item>(STORAGE_KEYS.NOTES, itemId, updateData, { userId })
			if (!result.success) throw new Error('Failed to move item')
			return result.data
		},
		async onMutate({ itemId, targetFolderId }) {
			await queryClient.cancelQueries({ queryKey: notesKeys.list(userId) })
			const previousNotes = queryClient.getQueryData<Item[]>(notesKeys.list(userId))

			queryClient.setQueryData<Item[] | undefined>(notesKeys.list(userId), (old) => {
				if (!old) return old

				const nextParentId = targetFolderId === null ? undefined : targetFolderId
				return old.map((item) =>
					item.id === itemId ? { ...item, parentFolderId: nextParentId } : item
				)
			})

			return { previousNotes }
		},
		onError: (_err, _variables, context) => {
			if (context?.previousNotes) {
				queryClient.setQueryData(notesKeys.list(userId), context.previousNotes)
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
		}
	})
}

export function useRenameItemMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useMutation({
		mutationFn: async ({ id, name }: { id: string; name: string }) => {
			const result = await update<Item>(STORAGE_KEYS.NOTES, id, { name }, { userId })
			if (!result.success) throw new Error('Failed to rename item')
			return result.data
		},
		onMutate: async ({ id, name }) => {
			await queryClient.cancelQueries({ queryKey: notesKeys.list(userId) })
			const previousNotes = queryClient.getQueryData(notesKeys.list(userId))

			queryClient.setQueryData(notesKeys.list(userId), (old: Item[] = []) => {
				const rename = (items: Item[]): Item[] => {
					return items.map((item) => {
						if (item.id === id) return { ...item, name }
						if (item.type === 'folder')
							return { ...item, children: rename(item.children) }
						return item
					})
				}
				return rename(old)
			})
			return { previousNotes }
		},
		onError: (err, vars, context) => {
			queryClient.setQueryData(notesKeys.list(userId), context?.previousNotes)
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
		}
	})
}

export function usePinItemMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useMutation({
		mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
			const result = await update<Item>(
				STORAGE_KEYS.NOTES,
				id,
				{ pinned, pinnedAt: pinned ? Date.now() : undefined },
				{ userId }
			)
			if (!result.success) throw new Error('Failed to pin item')
			return result.data
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
		}
	})
}

export function useFavoriteNoteMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useMutation({
		mutationFn: async ({ id, favorite }: { id: string; favorite: boolean }) => {
			const result = await update<Note>(STORAGE_KEYS.NOTES, id, { favorite }, { userId })
			if (!result.success) throw new Error('Failed to favorite note')
			return result.data
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
		}
	})
}

export function useSetNoteVisibilityMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useMutation({
		mutationFn: async ({ id, isPublic }: { id: string; isPublic: boolean }) => {
			const response = await fetch('/api/notes', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, isPublic })
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to set visibility')
			}

			return (await response.json()) as Note
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: notesKeys.list(userId) })
		}
	})
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Filter out deleted items recursively
 */
function filterActiveItems(items: Item[]): Item[] {
	return items
		.filter((item) => !item.deletedAt)
		.map((item) => {
			if (item.type === 'folder') {
				return { ...item, children: filterActiveItems(item.children || []) }
			}
			return item
		})
}
